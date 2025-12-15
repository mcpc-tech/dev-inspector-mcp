import type { IncomingMessage, ServerResponse } from "http";

/**
 * Set CORS headers and handle preflight requests.
 *
 * Uses the browser's requested headers (Access-Control-Request-Headers) when present
 * to avoid mismatches that can break CORS preflight (e.g. 'user-agent').
 *
 * Returns true if request was handled (preflight), false otherwise.
 */
export function handleCors(req: IncomingMessage, res: ServerResponse): boolean {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");

  const requested = req.headers["access-control-request-headers"];
  const requestedValue = Array.isArray(requested) ? requested.join(", ") : requested;

  res.setHeader(
    "Access-Control-Allow-Headers",
    requestedValue ?? "Content-Type, mcp-session-id, mcp-protocol-version",
  );

  // Handle preflight
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return true;
  }

  return false;
}
