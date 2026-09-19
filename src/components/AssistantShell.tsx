import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MessageSquarePlus, Trash2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { createThread, deleteThread, listThreads, type ChatThread } from "@/lib/chat.functions";

export function useAssistantSession() {
  const [state, setState] = useState<"loading" | "in" | "out">("loading");
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setState(data.session ? "in" : "out");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setState(session ? "in" : "out");
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  return state;
}

export function AssistantSignedOut() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center" dir="rtl">
      <p className="text-sm text-muted-foreground">
        سجّل دخول الموظفين لاستخدام المساعد الذكي.
      </p>
      <Link
        to="/login"
        search={{ next: "/assistant" }}
        className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        تسجيل الدخول
      </Link>
    </div>
  );
}

export function AssistantShell({
  activeThreadId,
  children,
}: {
  activeThreadId?: string;
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      setThreads(await listThreads());
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    void refresh();
  }, [activeThreadId]);

  const startThread = async () => {
    setBusy(true);
    try {
      const thread = await createThread();
      await refresh();
      void navigate({ to: "/assistant/$threadId", params: { threadId: thread.id } });
    } finally {
      setBusy(false);
    }
  };

  const removeThread = async (threadId: string) => {
    await deleteThread({ data: { threadId } });
    await refresh();
    if (threadId === activeThreadId) void navigate({ to: "/assistant" });
  };

  return (
    <div className="grid gap-4 md:grid-cols-[16rem_1fr]" dir="rtl">
      <aside className="rounded-xl border border-border bg-card p-3">
        <button
          type="button"
          onClick={() => void startThread()}
          disabled={busy}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          <MessageSquarePlus className="size-4" />
          محادثة جديدة
        </button>
        <ul className="mt-3 space-y-1">
          {threads.map((thread) => (
            <li
              key={thread.id}
              className={`flex items-center gap-1 rounded-md px-1 ${
                thread.id === activeThreadId ? "bg-accent" : ""
              }`}
            >
              <Link
                to="/assistant/$threadId"
                params={{ threadId: thread.id }}
                className="flex-1 truncate py-2 text-right text-sm hover:text-foreground"
              >
                {thread.title || "محادثة جديدة"}
              </Link>
              <button
                type="button"
                onClick={() => void removeThread(thread.id)}
                aria-label="حذف المحادثة"
                className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
          {threads.length === 0 && (
            <li className="px-2 py-3 text-xs text-muted-foreground">لا توجد محادثات بعد</li>
          )}
        </ul>
      </aside>
      <section className="rounded-xl border border-border bg-card">{children}</section>
    </div>
  );
}
