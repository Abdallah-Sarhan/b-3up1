import { createFileRoute } from "@tanstack/react-router";
import type { UIMessage } from "ai";
import { useEffect, useState } from "react";

import { AssistantChat } from "@/components/AssistantChat";
import {
  AssistantShell,
  AssistantSignedOut,
  useAssistantSession,
} from "@/components/AssistantShell";
import { getThreadMessages } from "@/lib/chat.functions";

export const Route = createFileRoute("/assistant/$threadId")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "محادثة المساعد — سجل مرضى جناح 39" },
      {
        name: "description",
        content: "محادثة محفوظة مع المساعد الذكي حول مرضى جناح 39.",
      },
      { property: "og:title", content: "محادثة المساعد — سجل مرضى جناح 39" },
      {
        property: "og:description",
        content: "تابع محادثتك مع المساعد الذكي حول بيانات جناح 39.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AssistantThread,
});

function AssistantThread() {
  const { threadId } = Route.useParams();
  const session = useAssistantSession();
  const [messages, setMessages] = useState<UIMessage[] | null>(null);

  useEffect(() => {
    if (session !== "in") return;
    setMessages(null);
    void getThreadMessages({ data: { threadId } })
      .then((rows) => setMessages(rows as unknown as UIMessage[]))
      .catch(() => setMessages([]));
  }, [threadId, session]);

  if (session === "loading") return null;
  if (session === "out") return <AssistantSignedOut />;

  return (
    <AssistantShell activeThreadId={threadId}>
      {messages ? (
        <AssistantChat key={threadId} threadId={threadId} initialMessages={messages} />
      ) : (
        <div className="p-8 text-center text-sm text-muted-foreground">جارٍ التحميل…</div>
      )}
    </AssistantShell>
  );
}
