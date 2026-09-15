import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { Activity, ArrowRight, FileWarning, Languages, Lock, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { useLang } from "@/lib/i18n";
import { setAppPassword, verifyAppPassword } from "@/components/AppLock";

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
  const isHome = pathname === "/";
  const [isDesktop, setIsDesktop] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [oldPass, setOldPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [passMsg, setPassMsg] = useState("");

  const lockNow = () => {
    try {
      sessionStorage.removeItem("ward39.unlocked");
    } catch {
      /* ignore */
    }
    window.location.reload();
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!(await verifyAppPassword(oldPass))) {
      setPassMsg("كلمة السر الحالية غير صحيحة");
      return;
    }
    if (newPass.length < 4) {
      setPassMsg("كلمة السر الجديدة يجب أن تكون 4 أحرف على الأقل");
      return;
    }
    await setAppPassword(newPass);
    setOldPass("");
    setNewPass("");
    setPassMsg("تم تغيير كلمة السر");
  };

  useEffect(() => {
    setIsDesktop(Boolean(window.ward39Desktop));
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
            {isDesktop ? (
              <button
                type="button"
                onClick={() => void window.ward39Desktop?.exportDiagnostics()}
                className="inline-flex size-9 items-center justify-center rounded-md border border-input hover:bg-accent"
                aria-label="حفظ تقرير التشخيص"
                title="حفظ تقرير التشخيص"
              >
                <FileWarning className="size-4" />
              </button>
            ) : null}
            <button
              onClick={() => setLang(lang === "ar" ? "en" : "ar")}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-input px-3 text-sm font-medium hover:bg-accent"
              aria-label="Switch language"
            >
              <Languages className="size-4" />
              {lang === "ar" ? "English" : "عربي"}
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 print:max-w-none print:p-0">{children}</main>
      <footer className="border-t border-border py-4 text-center text-xs text-muted-foreground print:hidden">
        {t("offlineReady")}
      </footer>
    </div>
  );
}
