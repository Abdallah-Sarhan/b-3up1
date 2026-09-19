/**
 * Lovable AI Gateway helpers (server-only).
 *
 * The gateway mints an `X-Lovable-AIG-Run-ID` per request. We capture it from
 * the first response and resend it on subsequent calls so app requests stay
 * correlated with gateway usage logs.
 */

const RUN_ID_HEADER = "X-Lovable-AIG-Run-ID";

export type LovableAiGatewayRunIdFetch = {
  fetch: typeof fetch;
  getRunId: () => string | undefined;
};

export function createLovableAiGatewayRunIdFetch(
  initialRunId?: string,
): LovableAiGatewayRunIdFetch {
  let runId = initialRunId;

  const wrapped: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    if (runId) headers.set(RUN_ID_HEADER, runId);
    const response = await fetch(input as RequestInfo, { ...init, headers });
    const returned = response.headers.get(RUN_ID_HEADER);
    if (returned) runId = returned;
    return response;
  };

  return { fetch: wrapped, getRunId: () => runId };
}

export function getLovableAiGatewayRunId(request: Request): string | undefined {
  return request.headers.get(RUN_ID_HEADER) ?? undefined;
}

export function getLovableAiGatewayResponseHeaders(
  base?: HeadersInit,
  extra?: Record<string, string>,
): Record<string, string> {
  const headers: Record<string, string> = {};
  if (base) new Headers(base).forEach((value, key) => (headers[key] = value));
  if (extra) Object.assign(headers, extra);
  return headers;
}

export function withLovableAiGatewayRunIdHeader(
  response: Response,
  runIdFetch: LovableAiGatewayRunIdFetch,
): Response {
  const runId = runIdFetch.getRunId();
  if (!runId) return response;
  const headers = new Headers(response.headers);
  headers.set(RUN_ID_HEADER, runId);
  headers.set("Access-Control-Expose-Headers", RUN_ID_HEADER);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
