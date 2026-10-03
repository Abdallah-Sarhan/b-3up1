import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuthProfile } from "@/components/AuthGate";
import { listUsers, setApproved, type ManagedUser } from "@/lib/auth.functions";

export const Route = createFileRoute("/users")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "إدارة المستخدمين — سجل مرضى جناح 39" },
      { name: "description", content: "موافقة المشرف على حسابات موظفي جناح 39 أو إيقافها." },
      { property: "og:title", content: "إدارة المستخدمين — جناح 39" },
      { property: "og:description", content: "إدارة حسابات موظفي جناح 39." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: UsersPage,
});

function UsersPage() {
  const me = useAuthProfile();
  const list = useServerFn(listUsers);
  const save = useServerFn(setApproved);
  const [users, setUsers] = useState<ManagedUser[] | null>(null);

  const load = useCallback(() => {
    list().then(setUsers).catch(() => toast.error("تعذّر تحميل المستخدمين (يحتاج إنترنت)"));
  }, [list]);
  useEffect(() => {
    if (me?.is_admin) load();
  }, [me?.is_admin, load]);

  if (!me?.is_admin) return <p className="text-sm text-muted-foreground">هذه الصفحة للمشرفين فقط.</p>;

  const toggle = async (u: ManagedUser) => {
    try {
      await save({ data: { id: u.id, approved: !u.approved } });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر الحفظ");
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">إدارة المستخدمين</h1>
      {!users ? (
        <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {users.map((u) => (
            <div key={u.id} className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-0">
              <div>
                <div className="text-sm font-medium">
                  {u.display_name || u.login_name} {u.is_admin && <span className="text-xs text-primary">(مشرف)</span>}
                </div>
                <div className="text-xs text-muted-foreground" dir="ltr">{u.login_name}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs ${u.approved ? "text-muted-foreground" : "text-destructive"}`}>
                  {u.approved ? "مفعّل" : "بانتظار الموافقة"}
                </span>
                {u.id !== me.id && (
                  <button type="button" onClick={() => void toggle(u)} className="h-8 rounded-md border border-input px-3 text-xs font-medium hover:bg-accent">
                    {u.approved ? "إيقاف" : "موافقة"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
