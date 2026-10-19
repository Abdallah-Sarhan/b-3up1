import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { desktopAuthAction } from "@/lib/desktop-auth.server";

// Only the desktop file origin and this app's deployed origin may read responses.
// This is a raw JSON transport, not a manual call into the server-function protocol.
function responseHeaders(request: Request) {
  const origin = request.headers.get("origin");
  const ownOrigin = new URL(request.url).origin;
  if (origin && origin !== "null" && origin !== ownOrigin) return null;
  return {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": origin ?? ownOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
  };
}

export const Route = createFileRoute("/api/public/desktop-auth")({
  server: { handlers: {
    OPTIONS: async ({ request }) => {
      const headers = responseHeaders(request);
      return new Response(null, { status: headers ? 204 : 403, headers: headers ?? {} });
    },
    POST: async ({ request }) => {
      const headers = responseHeaders(request);
      if (!headers) return new Response(null, { status: 403 });
      try {
        const body = z.object({
          action: z.enum(["signIn", "signUp", "reset", "listUsers", "setApproved"]),
          data: z.unknown().optional(),
        }).parse(await request.json());
        const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
        const result = await desktopAuthAction(body.action, body.data, token, new URL(request.url).origin);
        return Response.json(result, { headers });
      } catch {
        // Never log account details, submitted passwords, tokens, or email addresses.
        return Response.json({ error: "تعذّر تنفيذ الطلب" }, { status: 400, headers });
      }
    },
  } },
});
