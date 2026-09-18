import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { PATIENT_COLUMNS, supabaseForUser } from "../supabase";

export default defineTool({
  name: "search_patients",
  title: "Search patients",
  description:
    "Search Ward 39 patients by name, file number, folder number, diagnosis or doctor.",
  inputSchema: {
    query: z.string().trim().describe("Free text to match against patient fields."),
    limit: z.number().int().optional().describe("Maximum number of matches to return (1-100)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    if (!query) {
      return { content: [{ type: "text", text: "A non-empty query is required." }], isError: true };
    }
    const term = query.replace(/[%,()]/g, " ").trim();
    if (!term) {
      return { content: [{ type: "text", text: "A non-empty query is required." }], isError: true };
    }
    const max = Math.min(Math.max(limit ?? 25, 1), 100);
    const pattern = `%${term}%`;

    const { data, error } = await supabaseForUser(ctx)
      .from("patients")
      .select(PATIENT_COLUMNS)
      .or(
        [
          `name.ilike.${pattern}`,
          `file_no.ilike.${pattern}`,
          `folder_no.ilike.${pattern}`,
          `diagnosis.ilike.${pattern}`,
          `doctor.ilike.${pattern}`,
        ].join(","),
      )
      .limit(max);

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { patients: data ?? [], count: data?.length ?? 0 },
    };
  },
});
