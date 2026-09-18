import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { PATIENT_COLUMNS, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_patients",
  title: "List ward patients",
  description:
    "List patients in Ward 39, ordered by folder number. By default only current (not discharged) patients are returned.",
  inputSchema: {
    include_discharged: z
      .boolean()
      .optional()
      .describe("Include discharged patients as well. Defaults to false."),
    limit: z.number().int().optional().describe("Maximum number of patients to return (1-200)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ include_discharged, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const max = Math.min(Math.max(limit ?? 100, 1), 200);
    let query = supabaseForUser(ctx)
      .from("patients")
      .select(PATIENT_COLUMNS)
      .order("folder_no", { ascending: true })
      .limit(max);
    if (!include_discharged) query = query.is("discharged_at", null);

    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { patients: data ?? [], count: data?.length ?? 0 },
    };
  },
});
