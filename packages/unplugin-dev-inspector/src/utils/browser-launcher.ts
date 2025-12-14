import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { ServerContext } from "../mcp";

export interface BrowserLaunchOptions {
  /**
   * The URL to open in the browser
   */
  url: string;
  /**
   * Server context with host and port
   */
  serverContext: ServerContext;
}

/**
 * Launch browser via Chrome DevTools MCP
 * Uses MCP Client to connect to the MCP server endpoint
 */
export async function launchBrowserWithDevTools(options: BrowserLaunchOptions): Promise<boolean> {
  const { url, serverContext } = options;
  const host = serverContext.host === "0.0.0.0" ? "localhost" : serverContext.host || "localhost";
  const port = serverContext.port || 5173;
  const sseUrl = `http://${host}:${port}/__mcp__/sse?clientId=temp-browser-launcher`;

  let client: Client | null = null;

  try {
    // Create MCP client
    client = new Client({
      name: "dev-inspector-auto-browser",
      version: "1.0.0",
    });

    // Connect via SSE transport
    const transport = new SSEClientTransport(new URL(sseUrl));
    await client.connect(transport);

    // Call chrome_devtools tool to navigate
    await client.callTool({
      name: "chrome_devtools",
      arguments: {
        useTool: "chrome_navigate_page",
        hasDefinitions: ["chrome_navigate_page"],
        chrome_navigate_page: { url },
      },
    });
    await new Promise(r => setTimeout(r, 1000))
    return true;
  } catch (error) {
    console.error(
      `[dev-inspector] ⚠️  Failed to auto-open browser:`,
      error instanceof Error ? error.message : String(error),
    );
    return false;
  } finally {
    // Cleanup to prevent Chrome zombie processes
    // TODO: delay this after page cleanup
    await client?.close().catch(() => {});
  }
}
