import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "sonner";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { LanguageProvider } from "../lib/i18n";
import { AppShell } from "../components/AppShell";
import { AuthGate } from "../components/AuthGate";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: import("@tanstack/react-router").ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "سجل مرضى جناح 39 — Ward 39 Patient Registry" },
      {
        name: "description",
        content:
          "Online Ward 39 patient registry: cloud-based patient registration, printable data sheets, SBAR handover, vital signs, nursing notes and care plans.",
      },
      { name: "author", content: "Ward 39 — KCMH" },
      { property: "og:title", content: "Ward 39 Patient Registry" },
      {
        property: "og:description",
        content:
          "Online patient registry for Ward 39 with direct cloud records, printing, SBAR, vitals, nursing notes and care plans.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  // Delegated handling covers native, Radix, link, and custom button controls.
  useEffect(() => {
    let releaseTimer: ReturnType<typeof setTimeout> | undefined;
    let activeElement: HTMLElement | null = null;
    const selector = 'button:not(:disabled), a[href], [role="button"]:not([aria-disabled="true"]), input[type="button"]:not(:disabled), input[type="submit"]:not(:disabled), input[type="reset"]:not(:disabled)';
    const release = () => {
      if (releaseTimer) clearTimeout(releaseTimer);
      activeElement?.classList.remove("interaction-pressed");
      activeElement = null;
    };
    const press = (target: EventTarget | null) => {
      const element = target instanceof Element ? target.closest<HTMLElement>(selector) : null;
      if (!element) return;
      release();
      activeElement = element;
      element.classList.add("interaction-pressed");
      releaseTimer = setTimeout(release, 260);
    };
    const scheduleRelease = () => {
      if (releaseTimer) clearTimeout(releaseTimer);
      // Keep the visual acknowledgement after the finger is lifted.
      releaseTimer = setTimeout(release, 320);
    };
    const onPointerDown = (event: PointerEvent) => press(event.target);
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.key === "Enter" || event.key === " ") && !event.repeat) press(event.target);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointerup", scheduleRelease, true);
    document.addEventListener("pointercancel", scheduleRelease, true);
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("keyup", scheduleRelease, true);
    return () => {
      release();
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointerup", scheduleRelease, true);
      document.removeEventListener("pointercancel", scheduleRelease, true);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("keyup", scheduleRelease, true);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <AuthGate>
          <AppShell>
            {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
            <Outlet />
          </AppShell>
        </AuthGate>
        <Toaster richColors position="top-center" />
      </LanguageProvider>
    </QueryClientProvider>
  );
}
