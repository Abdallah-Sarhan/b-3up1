import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "تعيين كلمة سر جديدة — سجل مرضى جناح 39" },
      { name: "description", content: "عيّن كلمة سر جديدة لحسابك في سجل مرضى جناح 39." },
      { property: "og:title", content: "تعيين كلمة سر جديدة — جناح 39" },
      { property: "og:description", content: "استعادة كلمة سر حساب موظف جناح 39." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const [ready, setReady] = useState(false);
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setReady(true);
    });
    void supabase.auth.getSession().then(({ data }) => data.session && setReady(true));
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pass.length < 8) return setMsg({ text: "كلمة السر 8 أحرف على الأقل" });
    if (pass !== confirm) return setMsg({ text: "كلمتا السر غير متطابقتين" });
    const { error } = await supabase.auth.updateUser({ password: pass });
    if (error) return setMsg({ text: "تعذّر تغيير كلمة السر، اطلب رابطًا جديدًا" });
    setDone(true);
    setMsg({ text: "تم تغيير كلمة السر بنجاح", ok: true });
  };

  const input = "mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm";
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-sm">
        <h1 className="text-base font-bold">تعيين كلمة سر جديدة</h1>
        {!ready ? (
          <p className="mt-2 text-xs text-muted-foreground">افتح هذه الصفحة من رابط الاستعادة المرسل إلى بريدك.</p>
        ) : done ? null : (
          <>
            <input type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="كلمة السر الجديدة" aria-label="كلمة السر الجديدة" className={`${input} mt-4`} />
            <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="تأكيد كلمة السر" aria-label="تأكيد كلمة السر" className={input} />
            <button type="submit" className="mt-4 h-10 w-full rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90">حفظ</button>
          </>
        )}
        {msg && <p className={`mt-2 text-xs ${msg.ok ? "text-muted-foreground" : "text-destructive"}`}>{msg.text}</p>}
        <Link to="/" className="mt-3 block text-center text-xs text-muted-foreground underline underline-offset-2">الذهاب إلى البرنامج</Link>
      </form>
    </div>
  );
}
