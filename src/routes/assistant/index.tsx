import { createFileRoute } from "@tanstack/react-router";

import {
  AssistantShell,
  AssistantSignedOut,
  useAssistantSession,
} from "@/components/AssistantShell";

export const Route = createFileRoute("/assistant/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "المساعد الذكي — سجل مرضى جناح 39" },
      {
        name: "description",
        content: "اسأل المساعد الذكي عن مرضى جناح 39: الإشغال، الغرف، والبحث عن مريض.",
      },
      { property: "og:title", content: "المساعد الذكي — سجل مرضى جناح 39" },
      {
        property: "og:description",
        content: "مساعد ذكي يقرأ بيانات جناح 39 ويجيب عن أسئلة الفريق التمريضي.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AssistantIndex,
});

function AssistantIndex() {
  const session = useAssistantSession();
  if (session === "loading") return null;
  if (session === "out") return <AssistantSignedOut />;

  return (
    <AssistantShell>
      <div className="flex min-h-[40vh] items-center justify-center p-8 text-center text-sm text-muted-foreground">
        اختر محادثة من القائمة أو ابدأ محادثة جديدة.
      </div>
    </AssistantShell>
  );
}
