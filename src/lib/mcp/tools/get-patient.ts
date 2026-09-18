import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_patient",
  title: "Get patient record",
  description: "Fetch one Ward 39 patient's full record by file number.",
  inputSchema: {
    file_no: z.string().trim().describe("The patient's file number."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ file_no }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    if (!file_no) {
      return { content: [{ type: "text", text: "file_no is required." }], isError: true };
    }

    const { data, error } = await supabaseForUser(ctx)
      .from("patients")
      .select("*")
      .eq("file_no", file_no)
      .maybeSingle();

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data) {
      return {
        content: [{ type: "text", text: `No patient found with file number ${file_no}.` }],
        isError: true,
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { patient: data },
    };
  },
});
