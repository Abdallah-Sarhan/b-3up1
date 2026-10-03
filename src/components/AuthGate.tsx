import { useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Pages reachable without signing in. */
export function isPublicPath(pathname: string) {
  return (
    pathname.startsWith("/print") ||
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
    // Offline (desktop app): fall back to the last known profile of this user.
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null") as AuthProfile | null;
      return cached?.id === userId ? cached : null;
    } catch {
      return null;
    }
  }
}

export async function signOutEverywhere() {
  localStorage.removeItem(CACHE_KEY);
  publish(null);
  await supabase.auth.signOut();
  window.location.replace("/login");
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isPublic = isPublicPath(pathname);
  const [state, setState] = useState<"loading" | "out" | "pending" | "in">("loading");

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
      const p = await loadProfile(userId);
      publish(p);
      if (alive) setState(p?.approved ? "in" : "pending");
    };
    void supabase.auth.getSession().then(({ data }) => check(data.session?.user.id));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
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
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">جارٍ التحميل…</div>;
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
