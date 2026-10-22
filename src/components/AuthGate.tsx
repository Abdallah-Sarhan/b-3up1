import { useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { clearClinicalCloudCache, initializeClinicalCloud } from "@/lib/cloud-sync";

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

// Never leave the clinical app on an endless startup spinner if auth or cloud
// initialization stops responding. This does not mark data as loaded or saved.
function withStartupTimeout<T>(promise: Promise<T>, label: string, timeoutMs = 60_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(label));
    }, timeoutMs);
    promise.then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      (error) => { window.clearTimeout(timer); reject(error); },
    );
  });
}
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
    return p;
  } catch {
    // A network/database failure must not masquerade as an unapproved account.
    throw new Error("تعذر التحقق من اعتماد الحساب عبر السحابة. تحقق من الاتصال وأعد المحاولة.");
  }
}

export async function signOutEverywhere() {
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
  const [cloudWarning, setCloudWarning] = useState<string | null>(null);

  useEffect(() => {
    // Remove the old local device lock data.
    try {
      ["ward39.profile", "ward39.lockHash", "ward39.recoveryHash", "ward39.recovery", "ward39.lockSalt"].forEach((k) =>
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
        // Hide all clinical pages immediately, then erase the browser working copy.
        if (alive) setState("out");
        await clearClinicalCloudCache().catch(() => undefined);
        return;
      }
      try {
        const p = await withStartupTimeout(loadProfile(userId), "استغرق التحقق من اعتماد الحساب أكثر من دقيقة. لم يتم تحميل بيانات المرضى؛ أعد المحاولة وافحص إعدادات Lovable Cloud.");
        publish(p);
        if (!p?.approved) {
          await clearClinicalCloudCache().catch(() => undefined);
          if (alive) setState("pending");
          return;
        }
        // Keep clinical pages hidden until the cloud data pull succeeds.
        // Cached browser data must not appear as current cloud data.
        if (alive) setCloudWarning(null);
        await withStartupTimeout(
          initializeClinicalCloud(undefined, userId),
          "لم يكتمل تحميل بيانات السحابة خلال دقيقة. لم يتم عرض بيانات المرضى؛ تحقق من الاتصال ثم أعد المحاولة."
        );
        if (alive) setState("in");
      } catch (error) {
        // A failed approval check or incomplete cloud pull must not leave partial
        // or stale patient data stored locally after the error screen appears.
        await clearClinicalCloudCache().catch(() => undefined);
        if (alive) {
          setCloudError(error instanceof Error ? error.message : "تعذر فتح البيانات السحابية.");
          setState("cloud-error");
        }
      }
    };
    const onPageHide = (event: PageTransitionEvent) => {
      // Best-effort cleanup on tab/window close. Startup also clears the cache,
      // because browsers may terminate before an asynchronous pagehide cleanup finishes.
      if (!event.persisted) void clearClinicalCloudCache();
    };
    window.addEventListener("pagehide", onPageHide);

    let unsubscribe = () => {};
    try {
      void supabase.auth.getSession()
        .then(({ data, error }) => {
          if (error) throw error;
          return check(data.session?.user.id);
        })
        .catch(() => {
          if (alive) {
            setCloudError("تعذر الاتصال بخدمة تسجيل الدخول السحابية. راجع إعدادات Lovable Cloud ثم أعد المحاولة.");
            setState("cloud-error");
          }
        });
      const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === "SIGNED_OUT") void clearClinicalCloudCache();
        if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED")
          void check(session?.user.id);
      });
      unsubscribe = () => sub.subscription.unsubscribe();
    } catch {
      if (alive) {
        setCloudError("إعدادات الاتصال بسحابة Lovable Cloud غير مكتملة أو غير متاحة.");
        setState("cloud-error");
      }
    }
    return () => {
      alive = false;
      unsubscribe();
      window.removeEventListener("pagehide", onPageHide);
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
            onClick={() => window.location.reload()}
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
  return (
    <>
      {cloudWarning && (
        <div role="status" className="sticky top-0 z-50 border-b border-amber-500/40 bg-amber-100 px-4 py-2 text-center text-sm text-amber-950">
          {cloudWarning}
          <button
            type="button"
            className="ml-3 underline"
            onClick={() => window.location.reload()}
          >
            إعادة المحاولة
          </button>
        </div>
      )}
      {children}
    </>
  );
}
