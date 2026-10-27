import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { Activity, ArrowRight, Bot, Languages, Lock, LogOut, ShieldCheck, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { useLang } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { signOutEverywhere, useAuthProfile } from "@/components/AuthGate";

// In-app navigation trail so the back button retraces the exact path the
// user took inside the app, step by step, until the home page.
const navTrail: string[] = ["/"];
let navigatingBack = false;

export function AppShell({ children }: { children: React.ReactNode }) {
  const { lang, setLang, t } = useLang();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const href = useRouterState({ select: (s) => s.location.href });
  const isPrint = pathname.startsWith("/print");
  const profile = useAuthProfile();
  const isHome = pathname === "/";
  const [showPass, setShowPass] = useState(false);
  const [oldPass, setOldPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [passMsg, setPassMsg] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [isOnline, setIsOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPass.length < 8) return setPassMsg(t("passwordMinLength"));
    if (newPass !== confirmPass) return setPassMsg(t("passwordMismatch"));
    const { error } = await supabase.auth.updateUser({ password: newPass, current_password: oldPass } as never);
    if (error) return setPassMsg(/current|incorrect|invalid/i.test(error.message) ? t("passwordIncorrect") : t("passwordChangeFailed"));
    setOldPass(""); setNewPass(""); setConfirmPass("");
    setPassMsg(t("passwordChanged"));
  };

  useEffect(() => {
    const updateOnline = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  useEffect(() => {
    if (isPrint) return;
    if (navigatingBack) {
      navigatingBack = false;
      return;
    }
    const last = navTrail[navTrail.length - 1];
    if (last === href) return;
    // Re-visiting the page right below the top means the user went back
    // through the browser itself; drop the current entry instead of stacking.
    if (navTrail.length > 1 && navTrail[navTrail.length - 2] === href) {
      navTrail.pop();
      return;
    }
    navTrail.push(href);
  }, [href, isPrint]);

  const goBack = () => {
    navTrail.pop();
    const target = navTrail[navTrail.length - 1] ?? "/";
    navigatingBack = true;
    router.navigate({ to: target as never });
  };

  const isPublicScreen =
    pathname === "/login" ||
    pathname === "/reset-password" ||
    pathname.startsWith("/.lovable/oauth");

  if (!isPublicScreen && !isOnline) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-center shadow-sm">
          <h1 className="text-base font-bold">{t("offlineTitle")}</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {t("offlineDescription")}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 h-10 w-full rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            {t("retry")}
          </button>
          <button
            type="button"
            onClick={() => void signOutEverywhere()}
            className="mt-2 h-10 w-full rounded-md border border-input text-sm font-medium hover:bg-accent"
          >
            {t("signOut")}
          </button>
        </div>
      </div>
    );
  }

  if (isPrint) return <>{children}</>;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-card print:hidden">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-2">
            {!isHome && (
              <button
                type="button"
                onClick={goBack}
                className="inline-flex size-9 items-center justify-center rounded-md border border-input hover:bg-accent"
                aria-label={t("back")}
                title={t("back")}
              >
                <ArrowRight className="size-4" />
              </button>
            )}
          <Link to="/" className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Activity className="size-5" />
            </span>
            <span>
              <span className="block text-sm font-bold leading-tight">{t("appName")}</span>
              <span className="block text-xs text-muted-foreground leading-tight">
                {t("hospital")} — Ward 39
              </span>
            </span>
          </Link>
          </div>
          <nav className="flex items-center gap-2">
            <Link to="/patients">
              <span className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground">
                <Users className="size-4" />
                {t("patients")}
              </span>
            </Link>
            <Link to="/assistant">
              <span className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground">
                <Bot className="size-4" />
                {t("assistant")}
              </span>
            </Link>
            {profile?.is_admin && (
              <Link to="/users">
                <span className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground">
                  <ShieldCheck className="size-4" />
                  إدارة المستخدمين
                </span>
              </Link>
            )}
            <button
              onClick={() => setLang(lang === "ar" ? "en" : "ar")}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-input px-3 text-sm font-medium hover:bg-accent"
              aria-label="Switch language"
            >
              <Languages className="size-4" />
              {lang === "ar" ? "English" : "عربي"}
            </button>
            <button
              type="button"
              onClick={() => {
                setPassMsg("");
                setShowPass((v) => !v);
              }}
              className="inline-flex size-9 items-center justify-center rounded-md border border-input hover:bg-accent"
              aria-label="تغيير كلمة السر"
              title="تغيير كلمة السر"
            >
              <Lock className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => void signOutEverywhere()}
              className="inline-flex size-9 items-center justify-center rounded-md border border-input hover:bg-accent"
              aria-label="تسجيل الخروج"
              title={profile ? `تسجيل الخروج (${profile.login_name})` : "تسجيل الخروج"}
            >
              <LogOut className="size-4" />
            </button>
          </nav>
        </div>
        {showPass && (
          <div className="border-t border-border bg-card">
            <form
              onSubmit={changePassword}
              className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-3"
            >
              <input
                type="password"
                value={oldPass}
                onChange={(e) => setOldPass(e.target.value)}
                placeholder="كلمة السر الحالية"
                aria-label="كلمة السر الحالية"
                className="h-9 w-44 rounded-md border border-input bg-background px-3 text-sm"
              />
              <input
                type="password"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                placeholder="كلمة السر الجديدة"
                aria-label="كلمة السر الجديدة"
                className="h-9 w-44 rounded-md border border-input bg-background px-3 text-sm"
              />
              <input
                type="password"
                value={confirmPass}
                onChange={(e) => setConfirmPass(e.target.value)}
                placeholder="تأكيد كلمة السر"
                aria-label="تأكيد كلمة السر"
                className="h-9 w-44 rounded-md border border-input bg-background px-3 text-sm"
              />
              <button
                type="submit"
                className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                تغيير كلمة السر
              </button>
              {passMsg && <span className="text-xs text-muted-foreground">{passMsg}</span>}
            </form>
          </div>
        )}
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 print:max-w-none print:p-0">{children}</main>
    </div>
  );
}
