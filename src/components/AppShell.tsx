import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { Activity, ArrowRight, Languages, Users } from "lucide-react";
import { useLang } from "@/lib/i18n";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { lang, setLang, t } = useLang();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isPrint = pathname.startsWith("/print");
  const isHome = pathname === "/";

  if (isPrint) return <>{children}</>;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur print:hidden">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-2">
            {!isHome && (
              <button
                type="button"
                onClick={() => {
                  if (window.history.length > 1) router.history.back();
                  else router.navigate({ to: "/" });
                }}
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
          <nav className="flex items-center gap-2">
            <Link to="/patients">
              <span className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground">
                <Users className="size-4" />
                {t("patients")}
              </span>
            </Link>
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
