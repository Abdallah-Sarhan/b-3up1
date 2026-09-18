import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "ward_summary",
  title: "Ward occupancy summary",
  description:
    "Summarise Ward 39: how many patients are currently admitted, how many are discharged, and the rooms in use.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_args, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);

    const [current, discharged] = await Promise.all([
      supabase.from("patients").select("room", { count: "exact" }).is("discharged_at", null),
      supabase
        .from("patients")
        .select("id", { count: "exact", head: true })
        .not("discharged_at", "is", null),
    ]);

    if (current.error) {
      return { content: [{ type: "text", text: current.error.message }], isError: true };
    }
    if (discharged.error) {
      return { content: [{ type: "text", text: discharged.error.message }], isError: true };
    }

    const rooms = [
      ...new Set(
        (current.data ?? [])
          .map((row) => (row as { room: string | null }).room?.trim())
          .filter((room): room is string => Boolean(room)),
      ),
    ].sort();

    const summary = {
      current_patients: current.count ?? current.data?.length ?? 0,
      discharged_patients: discharged.count ?? 0,
      rooms_in_use: rooms,
    };

    return {
      content: [{ type: "text", text: JSON.stringify(summary) }],
      structuredContent: summary,
    };
  },
});
