import type { ServerResponse } from "http";

/**
 * Set CORS headers and handle preflight requests
 * Returns true if request was handled (preflight), false otherwise
 */
export function handleCors(res: ServerResponse, method?: string): boolean {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id, mcp-protocol-version');

  // Handle preflight
  if (method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }

  return false;
}
