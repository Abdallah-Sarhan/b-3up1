import { useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { clearClinicalCloudCache, initializeClinicalCloud, retryClinicalCloudInitialization } from "@/lib/cloud-sync";

/** Pages reachable without signing in. */
export function isPublicPath(pathname: string) {
  return (
    pathname === "/login" ||
    pathname === "/reset-password" ||
    pathname.startsWith("/.lovable/oauth")
  );
}

export type AuthProfile = {
  id: string;
  login_name: string;
  display_name: string;
  approved: boolean;
  is_admin: boolean;
};

const CACHE_KEY = "ward39.profile";
let currentProfile: AuthProfile | null = null;
const listeners = new Set<(p: AuthProfile | null) => void>();
export function useAuthProfile() {
  const [p, setP] = useState(currentProfile);
  useEffect(() => {
    listeners.add(setP);
    return () => void listeners.delete(setP);
  }, []);
  return p;
}
function publish(p: AuthProfile | null) {
  currentProfile = p;
  listeners.forEach((l) => l(p));
}

async function loadProfile(userId: string): Promise<AuthProfile | null> {
  try {
    const [{ data: prof, error }, { data: admin }] = await Promise.all([
      supabase.from("profiles").select("id, login_name, display_name, approved").eq("id", userId).maybeSingle(),
      supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    ]);
    if (error) throw error;
    if (!prof) return null;
    const p = { ...prof, is_admin: Boolean(admin) };
    localStorage.setItem(CACHE_KEY, JSON.stringify(p));
    return p;
  } catch {
    // A network/database failure must not masquerade as an unapproved account.
    throw new Error("تعذر التحقق من اعتماد الحساب عبر السحابة. تحقق من الاتصال وأعد المحاولة.");
  }
}

export async function signOutEverywhere() {
  localStorage.removeItem(CACHE_KEY);
  publish(null);
  try {
    await clearClinicalCloudCache();
  } catch {
    // Always finish signing out; cloud records are never deleted by cache cleanup.
  }
  await supabase.auth.signOut();
  window.location.replace("/login");
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isPublic = isPublicPath(pathname);
  const [state, setState] = useState<"loading" | "out" | "pending" | "cloud-error" | "in">("loading");
  const [cloudError, setCloudError] = useState("تعذر الاتصال بالسحابة.");

  useEffect(() => {
    // Remove the old local device lock data.
    try {
      ["ward39.lockHash", "ward39.recoveryHash", "ward39.recovery", "ward39.lockSalt"].forEach((k) =>
        localStorage.removeItem(k),
      );
      sessionStorage.removeItem("ward39.unlocked");
    } catch {
      /* ignore */
    }

    let alive = true;
    const check = async (userId: string | undefined) => {
      if (!userId) {
        publish(null);
        if (alive) setState("out");
        return;
      }
      try {
        const p = await loadProfile(userId);
        publish(p);
        if (!p?.approved) {
          if (alive) setState("pending");
          return;
        }
        await initializeClinicalCloud();
        if (alive) setState("in");
      } catch (error) {
        if (alive) {
          setCloudError(error instanceof Error ? error.message : "تعذر فتح البيانات السحابية.");
          setState("cloud-error");
        }
      }
    };
    void supabase.auth.getSession()
      .then(({ data }) => check(data.session?.user.id))
      .catch(() => {
        if (alive) {
          setCloudError("تعذر الاتصال بخدمة تسجيل الدخول السحابية.");
          setState("cloud-error");
        }
      });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") void clearClinicalCloudCache();
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED")
        void check(session?.user.id);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (state === "out" && !isPublic) {
      void router.navigate({ to: "/login", search: { next: pathname }, replace: true });
    }
  }, [state, isPublic, pathname, router]);

  if (isPublic) return <>{children}</>;
  if (state === "loading" || state === "out") {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">جارٍ التحقق من الحساب وتحميل بيانات السحابة…</div>;
  }
  if (state === "cloud-error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-center shadow-sm">
          <h1 className="text-base font-bold">تعذر الاتصال ببيانات الجناح السحابية</h1>
          <p className="mt-3 text-sm text-muted-foreground">{cloudError}</p>
          <p className="mt-2 text-xs text-muted-foreground">لم نعرض بيانات محلية قديمة على أنها محدثة من السحابة، ولم نؤكد أي حفظ لم يصل إلى الخادم.</p>
          <button
            type="button"
            onClick={() => {
              setState("loading");
              void retryClinicalCloudInitialization().then(() => setState("in")).catch((error) => {
                setCloudError(error instanceof Error ? error.message : "تعذر الاتصال بالسحابة.");
                setState("cloud-error");
              });
            }}
            className="mt-5 h-10 w-full rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            إعادة الاتصال والمحاولة
          </button>
          <button
            type="button"
            onClick={() => void signOutEverywhere()}
            className="mt-2 h-10 w-full rounded-md border border-input text-sm font-medium hover:bg-accent"
          >
            تسجيل الخروج
          </button>
        </div>
      </div>
    );
  }
  if (state === "pending") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 text-center shadow-sm">
          <h1 className="text-base font-bold">بانتظار موافقة المشرف</h1>
          <p className="mt-2 text-xs text-muted-foreground">
            تم إنشاء حسابك. سيتمكن من الدخول إلى بيانات المرضى بعد أن يوافق عليه مشرف الجناح.
          </p>
          <button
            type="button"
            onClick={() => void signOutEverywhere()}
            className="mt-4 h-10 w-full rounded-md border border-input text-sm font-medium hover:bg-accent"
          >
            تسجيل الخروج
          </button>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
