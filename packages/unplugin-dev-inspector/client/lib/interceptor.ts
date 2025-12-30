import { getDevServerBaseUrl } from "../utils/config-loader";
import { BatchInterceptor } from "@mswjs/interceptors";
import { FetchInterceptor } from "@mswjs/interceptors/fetch";
import { XMLHttpRequestInterceptor } from "@mswjs/interceptors/XMLHttpRequest";

interface InterceptorConfig {
  disableChrome?: boolean;
}

export function initInterceptors(config?: InterceptorConfig) {
  // Only enable if Chrome is disabled or explicitly requested
  if (!config?.disableChrome) return;

  const baseUrl = getDevServerBaseUrl();
  const logEndpoint = `${baseUrl}/__inspector__/log`;

  // --- Console Interception ---
  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
    debug: console.debug,
  };

  const interceptConsole = (type: keyof typeof originalConsole) => {
    console[type] = (...args: any[]) => {
      // Call original
      originalConsole[type].apply(console, args);

      // Serialize safe args
      const safeArgs = args.map((arg) => {
        try {
          if (typeof arg === "object" && arg !== null) {
            const cache = new Set();
            return JSON.parse(
              JSON.stringify(arg, (key, value) => {
                if (typeof value === "object" && value !== null) {
                  if (cache.has(value)) return "[Circular]";
                  cache.add(value);
                }
                return value;
              }),
            );
          }
          return arg;
        } catch {
          return String(arg);
        }
      });

      // Send to server
      fetch(logEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "console",
          data: { type, args: safeArgs },
        }),
        keepalive: true,
      }).catch(() => {});
    };
  };

  (["log", "warn", "error", "info", "debug"] as const).forEach(interceptConsole);

  // --- Network Interception using @mswjs/interceptors ---
  const interceptor = new BatchInterceptor({
    name: "dev-inspector-interceptor",
    interceptors: [new FetchInterceptor(), new XMLHttpRequestInterceptor()],
  });

  interceptor.apply();

  interceptor.on("response", async ({ request, response }) => {
    // Filter out our own logs to prevent infinite loops
    if (
      request.url.includes("/__inspector__") ||
      request.url.includes("/__mcp__") ||
      request.url.includes("/api/acp/chat")
    ) {
      return;
    }

    try {
      // Capture request details
      const requestHeaders: Record<string, string> = {};
      request.headers.forEach((value, key) => {
        requestHeaders[key] = value;
      });

      // Capture response details
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      // Try to read response body (clone to avoid consuming it)
      let responseBody = "";
      try {
        const cloned = response.clone();
        const contentType = response.headers.get("content-type") || "";

        if (contentType.includes("application/json")) {
          const json = await cloned.json();
          responseBody = JSON.stringify(json, null, 2);
        } else if (contentType.includes("text/")) {
          responseBody = await cloned.text();
        } else {
          responseBody = `<Binary data, ${contentType}>`;
        }

        // Truncate if too large
        if (responseBody.length > 10000) {
          responseBody = responseBody.substring(0, 10000) + "\n... (truncated)";
        }
      } catch {
        responseBody = "<Failed to read response body>";
      }

      // Format details for display
      const details = `Request:
  Method: ${request.method}
  URL: ${request.url}
  Headers:
${Object.entries(requestHeaders)
  .map(([k, v]) => `    ${k}: ${v}`)
  .join("\n")}

Response:
  Status: ${response.status} ${response.statusText}
  Headers:
${Object.entries(responseHeaders)
  .map(([k, v]) => `    ${k}: ${v}`)
  .join("\n")}
  Body:
${responseBody}`;

      // Send to server with details
      fetch(logEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "network",
          data: {
            method: request.method,
            url: request.url,
            status: response.status,
            duration: 0, // Could track this with request start time
            details,
          },
        }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      // Fallback if detail capture fails - send basic info
      fetch(logEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "network",
          data: {
            method: request.method,
            url: request.url,
            status: response.status,
            duration: 0,
          },
        }),
        keepalive: true,
      }).catch(() => {});
    }
  });
}
