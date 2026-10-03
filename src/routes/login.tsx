import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import {
  passwordSchema,
  requestPasswordReset,
  signInWithUsername,
  signUpWithUsername,
  usernameSchema,
} from "@/lib/auth.functions";

export const Route = createFileRoute("/login")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "تسجيل دخول الموظفين — سجل مرضى جناح 39" },
      { name: "description", content: "سجّل دخولك باسم المستخدم وكلمة السر للوصول إلى سجل مرضى جناح 39." },
      { property: "og:title", content: "تسجيل دخول الموظفين — سجل مرضى جناح 39" },
      { property: "og:description", content: "دخول موظفي جناح 39 باسم المستخدم وكلمة السر." },
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
  return next.startsWith("/") && !next.startsWith("//") && next !== "/login" ? next : "/";
}

const signUpSchema = z
  .object({
    username: usernameSchema,
    displayName: z.string().trim().min(1, "أدخل الاسم الظاهر").max(80),
    password: passwordSchema,
    confirm: z.string(),
    recoveryEmail: z.string().trim().email("أدخل بريد استعادة صحيح").max(255),
  })
  .refine((d) => d.password === d.confirm, { message: "كلمتا السر غير متطابقتين" });

const input = "mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

function Login() {
  const { next } = Route.useSearch();
  const navigate = useNavigate();
  const signIn = useServerFn(signInWithUsername);
  const signUp = useServerFn(signUpWithUsername);
  const reset = useServerFn(requestPasswordReset);
  const [mode, setMode] = useState<"in" | "up" | "forgot">("in");
  const [f, setF] = useState({ username: "", displayName: "", password: "", confirm: "", recoveryEmail: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok?: boolean } | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.value });

  const target = safeNext(next);
  const go = () => {
    if (target.startsWith("/.lovable/")) window.location.href = target;
    else void navigate({ to: target as never });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    if (!navigator.onLine) {
      setMessage({ text: "تسجيل الدخول يحتاج اتصالاً بالإنترنت" });
      return;
    }
    setBusy(true);
    try {
      if (mode === "forgot") {
        await reset({ data: { username: f.username.trim().slice(0, 30) || "x" } });
        setMessage({ text: "إذا كان الحساب موجودًا سيتم إرسال رابط الاستعادة إلى بريد الاستعادة.", ok: true });
        return;
      }
      if (mode === "up") {
        const parsed = signUpSchema.safeParse(f);
        if (!parsed.success) {
          setMessage({ text: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" });
          return;
        }
        const { confirm: _c, ...payload } = parsed.data;
        const r = await signUp({ data: payload });
        if (!r.ok) {
          setMessage({ text: r.error });
          return;
        }
      }
      const u = usernameSchema.safeParse(f.username);
      if (!u.success || !f.password) {
        setMessage({ text: "اسم المستخدم أو كلمة السر غير صحيحة" });
        return;
      }
      const r = await signIn({ data: { username: u.data, password: f.password } });
      if (!r.ok) {
        setMessage({ text: r.error });
        return;
      }
      await supabase.auth.setSession({ access_token: r.access_token, refresh_token: r.refresh_token });
      go();
    } catch {
      setMessage({ text: "حدث خطأ، حاول مرة أخرى" });
    } finally {
      setBusy(false);
    }
  };

  const title = mode === "in" ? "تسجيل دخول الموظفين" : mode === "up" ? "إنشاء حساب موظف" : "نسيت كلمة السر؟";
  const hint =
    mode === "in"
      ? "أدخل اسم المستخدم وكلمة السر للمتابعة"
      : mode === "up"
        ? "يحتاج الحساب الجديد موافقة المشرف قبل الوصول لبيانات المرضى"
        : "أدخل اسم المستخدم وسنرسل رابط الاستعادة إلى بريد الاستعادة المسجّل";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-sm">
        <h1 className="text-base font-bold">{title}</h1>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>

        <input
          required
          autoComplete="username"
          value={f.username}
          onChange={set("username")}
          placeholder="اسم المستخدم"
          aria-label="اسم المستخدم"
          dir="ltr"
          className={`${input} mt-4`}
        />
        {mode === "up" && (
          <input required value={f.displayName} onChange={set("displayName")} placeholder="الاسم الظاهر" aria-label="الاسم الظاهر" className={input} />
        )}
        {mode !== "forgot" && (
          <input
            type="password"
            required
            autoComplete={mode === "in" ? "current-password" : "new-password"}
            value={f.password}
            onChange={set("password")}
            placeholder="كلمة السر"
            aria-label="كلمة السر"
            className={input}
          />
        )}
        {mode === "up" && (
          <>
            <input type="password" required autoComplete="new-password" value={f.confirm} onChange={set("confirm")} placeholder="تأكيد كلمة السر" aria-label="تأكيد كلمة السر" className={input} />
            <input type="email" required dir="ltr" value={f.recoveryEmail} onChange={set("recoveryEmail")} placeholder="بريد الاستعادة" aria-label="بريد الاستعادة" className={input} />
            <p className="mt-1 text-[11px] text-muted-foreground">يُستخدم البريد فقط لاستعادة كلمة السر.</p>
          </>
        )}

        {message && <p className={`mt-2 text-xs ${message.ok ? "text-muted-foreground" : "text-destructive"}`}>{message.text}</p>}

        <button
          type="submit"
          disabled={busy}
          className="mt-4 h-10 w-full rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {mode === "in" ? "دخول" : mode === "up" ? "إنشاء حساب" : "إرسال رابط الاستعادة"}
        </button>
        <div className="mt-3 flex justify-between text-xs text-muted-foreground">
          {mode === "in" ? (
            <>
              <button type="button" onClick={() => { setMode("up"); setMessage(null); }} className="underline underline-offset-2 hover:text-foreground">إنشاء حساب</button>
              <button type="button" onClick={() => { setMode("forgot"); setMessage(null); }} className="underline underline-offset-2 hover:text-foreground">نسيت كلمة السر؟</button>
            </>
          ) : (
            <button type="button" onClick={() => { setMode("in"); setMessage(null); }} className="underline underline-offset-2 hover:text-foreground">رجوع لتسجيل الدخول</button>
          )}
        </div>
      </form>
    </div>
  );
}
