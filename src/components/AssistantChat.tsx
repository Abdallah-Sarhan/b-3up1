import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { supabase } from "@/integrations/supabase/client";
import assistantAvatar from "@/assets/assistant-avatar.png";

const TOOL_LABELS: Record<string, string> = {
  "tool-ward_summary": "ملخص الجناح",
  "tool-list_patients": "قائمة المرضى",
  "tool-search_patients": "بحث عن مريض",
  "tool-get_patient": "سجل مريض",
};

export function AssistantChat({
  threadId,
  initialMessages,
}: {
  threadId: string;
  initialMessages: UIMessage[];
}) {
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        headers: async () => {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
        body: { threadId },
      }),
    [threadId],
  );

  const { messages, sendMessage, status, stop } = useChat({
    id: threadId,
    messages: initialMessages,
    transport,
    onError: (err) => setError(err.message || "تعذّر الاتصال بالمساعد"),
  });

  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    if (!busy) textareaRef.current?.focus();
  }, [busy, threadId]);

  return (
    <div className="flex h-[calc(100vh-11rem)] flex-col" dir="rtl">
      <Conversation>
        <ConversationContent>
          {messages.length === 0 ? (
            <ConversationEmptyState
              icon={<img src={assistantAvatar} alt="" className="size-14" />}
              title="مساعد جناح 39"
              description="اسأل عن عدد المرضى المقيمين، الغرف المشغولة، أو ابحث عن مريض بالاسم أو رقم الملف."
            />
          ) : (
            messages.map((message) => (
              <Message key={message.id} from={message.role}>
                <MessageContent>
                  {message.parts.map((part, index) => {
                    if (part.type === "text") {
                      return (
                        <MessageResponse key={index}>{part.text}</MessageResponse>
                      );
                    }
                    if (part.type.startsWith("tool-")) {
                      const toolPart = part as {
                        type: `tool-${string}`;
                        state: "input-streaming" | "input-available" | "output-available" | "output-error";
                        input?: unknown;
                        output?: unknown;
                        errorText?: string;
                      };
                      return (
                        <Tool key={index} defaultOpen={false}>
                          <ToolHeader
                            type={toolPart.type}
                            state={toolPart.state}
                            title={TOOL_LABELS[toolPart.type] ?? toolPart.type}
                          />
                          <ToolContent>
                            <ToolInput input={toolPart.input} />
                            <ToolOutput
                              output={toolPart.output}
                              errorText={toolPart.errorText}
                            />
                          </ToolContent>
                        </Tool>
                      );
                    }
                    return null;
                  })}
                </MessageContent>
              </Message>
            ))
          )}
          {status === "submitted" && <Shimmer>جارٍ التفكير…</Shimmer>}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {error && (
        <p role="alert" className="px-4 pb-2 text-xs text-destructive">
          {error}
        </p>
      )}

      <div className="p-2">
        <PromptInput
          onSubmit={(message, event) => {
            const text = message.text?.trim();
            if (!text || busy) return;
            setError(null);
            void sendMessage({ text });
            (event.currentTarget as HTMLFormElement).reset();
          }}
        >
          <PromptInputTextarea
            ref={textareaRef}
            autoFocus
            placeholder="اكتب سؤالك عن مرضى الجناح…"
          />
          <PromptInputFooter className="justify-end">
            <PromptInputSubmit status={status} onStop={stop} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
