import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, stepCountIs, streamText, tool, type UIMessage } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";

import {
  createLovableAiGatewayRunIdFetch,
  getLovableAiGatewayResponseHeaders,
  getLovableAiGatewayRunId,
  withLovableAiGatewayRunIdHeader,
} from "@/lib/ai-gateway.server";
import {
  getPatient,
  listPatients,
  searchPatients,
  supabaseWithToken,
  wardSummary,
} from "@/lib/ward-queries.server";

type ChatRequestBody = { messages?: unknown; threadId?: unknown };

const SYSTEM_PROMPT = `أنت مساعد تمريضي لسجل مرضى "جناح 39" في مستشفى الكويت (KCMH).
- أجب دائمًا بالعربية بأسلوب مختصر وعملي، ما لم يطلب المستخدم الإنجليزية.
- استخدم الأدوات المتاحة للحصول على بيانات المرضى الحقيقية؛ لا تخترع أي بيانات أبدًا.
- إذا لم تجد المريض، قل ذلك بوضوح واقترح البحث باسم أو رقم ملف آخر.
- أنت للقراءة فقط: لا تستطيع إضافة أو تعديل أو حذف أي مريض، وإذا طُلب منك ذلك وجّه المستخدم لصفحة المرضى.
- عند عرض عدة مرضى استخدم قائمة مختصرة: الاسم، رقم الملف، الغرفة، التشخيص.`;

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
        if (!token) return new Response("Unauthorized", { status: 401 });

        const supabase = supabaseWithToken(token);
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user) return new Response("Unauthorized", { status: 401 });
        const userId = userData.user.id;

        const body = (await request.json()) as ChatRequestBody;
        const messages = body.messages;
        const threadId = typeof body.threadId === "string" ? body.threadId : null;
        if (!Array.isArray(messages)) {
          return new Response("Messages are required", { status: 400 });
        }
        if (!threadId) return new Response("threadId is required", { status: 400 });

        // RLS guarantees the thread belongs to this user.
        const { data: thread } = await supabase
          .from("chat_threads")
          .select("id, title")
          .eq("id", threadId)
          .maybeSingle();
        if (!thread) return new Response("Thread not found", { status: 404 });

        const key = process.env["LOVABLE_API_KEY"];
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const uiMessages = messages as UIMessage[];
        const lastMessage = uiMessages[uiMessages.length - 1];
        if (lastMessage?.role === "user") {
          await supabase.from("chat_messages").insert({
            thread_id: threadId,
            user_id: userId,
            role: "user",
            parts: lastMessage.parts ?? [],
          });
          if (!thread.title || thread.title === "محادثة جديدة") {
            const text = (lastMessage.parts ?? [])
              .map((part) => (part.type === "text" ? part.text : ""))
              .join(" ")
              .trim();
            if (text) {
              await supabase
                .from("chat_threads")
                .update({ title: text.slice(0, 60) })
                .eq("id", threadId);
            }
          }
        }

        const initialRunId = getLovableAiGatewayRunId(request);
        const runIdFetch = createLovableAiGatewayRunIdFetch(initialRunId);
        const lovable = createOpenAI({
          baseURL: "https://ai.gateway.lovable.dev/v1",
          apiKey: key,
          headers: { "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
          fetch: runIdFetch.fetch,
        });

        const result = streamText({
          model: lovable.responses("openai/gpt-6-astra"),
          system: SYSTEM_PROMPT,
          messages: await convertToModelMessages(uiMessages),
          stopWhen: stepCountIs(50),
          tools: {
            ward_summary: tool({
              description:
                "ملخص إشغال جناح 39: عدد المرضى المقيمين، عدد الخارجين، والغرف المستخدمة.",
              inputSchema: z.object({}),
              execute: async () => wardSummary(supabase),
            }),
            list_patients: tool({
              description: "قائمة مرضى جناح 39 مرتبة حسب رقم الفولدر.",
              inputSchema: z.object({
                include_discharged: z
                  .boolean()
                  .nullable()
                  .describe("تضمين المرضى الخارجين. الافتراضي لا."),
                limit: z.number().int().nullable().describe("أقصى عدد نتائج (1-200)."),
              }),
              execute: async ({ include_discharged, limit }) =>
                listPatients(supabase, { includeDischarged: include_discharged, limit }),
            }),
            search_patients: tool({
              description: "بحث عن مرضى بالاسم أو رقم الملف أو الفولدر أو التشخيص أو الطبيب.",
              inputSchema: z.object({
                query: z.string().describe("نص البحث."),
                limit: z.number().int().nullable().describe("أقصى عدد نتائج (1-100)."),
              }),
              execute: async ({ query, limit }) => searchPatients(supabase, { query, limit }),
            }),
            get_patient: tool({
              description: "سجل مريض واحد كامل عبر رقم الملف.",
              inputSchema: z.object({ file_no: z.string().describe("رقم ملف المريض.") }),
              execute: async ({ file_no }) => getPatient(supabase, file_no),
            }),
          },
          providerOptions: {
            openai: {
              forceReasoning: true,
              reasoningEffort: "low",
              reasoningSummary: "auto",
              store: false,
              include: ["reasoning.encrypted_content"],
            },
          },
        });

        return withLovableAiGatewayRunIdHeader(
          result.toUIMessageStreamResponse({
            originalMessages: uiMessages,
            sendReasoning: false,
            onFinish: async ({ responseMessage }) => {
              if (!responseMessage) return;
              const { error } = await supabase.from("chat_messages").insert({
                thread_id: threadId,
                user_id: userId,
                role: responseMessage.role,
                parts: responseMessage.parts ?? [],
              });
              if (error) console.error("chat_messages insert failed", error.message);
              await supabase
                .from("chat_threads")
                .update({ updated_at: new Date().toISOString() })
                .eq("id", threadId);
            },
            headers: getLovableAiGatewayResponseHeaders(undefined, {
              ...(initialRunId ? { "X-Lovable-AIG-Run-ID": initialRunId } : {}),
            }),
          }),
          runIdFetch,
        );
      },
    },
  },
});
