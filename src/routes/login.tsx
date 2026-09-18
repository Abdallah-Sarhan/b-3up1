import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Staff sign-in used by the OAuth consent flow (AI assistant connections).
 * The in-app device password lock is separate and untouched.
 */
export const Route = createFileRoute("/login")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "تسجيل دخول الموظفين — سجل مرضى جناح 39" },
      {
        name: "description",
        content:
          "صفحة تسجيل دخول موظفي جناح 39 لربط مساعد الذكاء الاصطناعي بسجل المرضى بشكل آمن.",
      },
      { property: "og:title", content: "تسجيل دخول الموظفين — سجل مرضى جناح 39" },
      {
        property: "og:description",
        content: "سجّل دخولك للسماح لمساعد الذكاء الاصطناعي بقراءة بيانات جناح 39.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    next: typeof s["next"] === "string" ? (s["next"] as string) : "",
  }),
  component: Login,
});

function safeNext(next: string): string {
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

function Login() {
  const { next } = Route.useSearch();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"in" | "up">("in");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const target = safeNext(next);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);

    if (mode === "up") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}${target}` },
      });
      setBusy(false);
      setMessage(error ? error.message : "تم إنشاء الحساب — افتح بريدك لتأكيد التسجيل.");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    if (target.startsWith("/.lovable/")) window.location.href = target;
    else void navigate({ to: target as never });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-sm"
      >
        <h1 className="text-base font-bold">تسجيل دخول الموظفين</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          {mode === "in"
            ? "أدخل بريدك وكلمة السر للمتابعة"
            : "أنشئ حساب موظف جديد بالبريد الإلكتروني"}
        </p>

        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="البريد الإلكتروني"
          aria-label="البريد الإلكتروني"
          className="mt-4 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        />
        <input
          type="password"
          required
          autoComplete={mode === "in" ? "current-password" : "new-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="كلمة السر"
          aria-label="كلمة السر"
          className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        />

        {message && <p className="mt-2 text-xs text-destructive">{message}</p>}

        <button
          type="submit"
          disabled={busy}
          className="mt-4 h-10 w-full rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {mode === "in" ? "دخول" : "إنشاء حساب"}
        </button>
        <button
          type="button"
          onClick={() => {
            setMode(mode === "in" ? "up" : "in");
            setMessage(null);
          }}
          className="mt-3 w-full text-center text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          {mode === "in" ? "ليس لديك حساب؟ إنشاء حساب" : "لدي حساب — تسجيل الدخول"}
        </button>
      </form>
    </div>
  );
}
