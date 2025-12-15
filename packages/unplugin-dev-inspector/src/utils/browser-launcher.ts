import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { isChromeDisabled } from "./helpers";
import type { ServerContext } from "../mcp";

let sharedClient: Client | null = null;
let sharedSseUrl: string | null = null;
let connectPromise: Promise<Client> | null = null;
let cleanupRegistered = false;

async function closeSharedClient(reason?: string): Promise<void> {
  const clientToClose = sharedClient;
  sharedClient = null;
  sharedSseUrl = null;
  connectPromise = null;

  if (!clientToClose) return;
  try {
    console.log(`[dev-inspector] Closing shared browser client: ${reason}`);
    await clientToClose.close();
  } catch {
    // Best-effort cleanup
  }
}

function registerProcessCleanupOnce(): void {
  if (cleanupRegistered) return;
  cleanupRegistered = true;

  const requestCleanupThenReraise = (signal: NodeJS.Signals) => {
    void closeSharedClient(signal).finally(() => {
      try {
        process.kill(process.pid, signal);
      } catch {
        // If re-raising fails, fall back to exiting.
        process.exit(1);
      }
    });
  };

  process.once("beforeExit", () => {
    void closeSharedClient("beforeExit");
  });
  process.once("SIGINT", () => requestCleanupThenReraise("SIGINT"));
  process.once("SIGTERM", () => requestCleanupThenReraise("SIGTERM"));
  process.once("SIGHUP", () => requestCleanupThenReraise("SIGHUP"));
}

async function getOrCreateClient(sseUrl: string): Promise<Client> {
  if (sharedClient && sharedSseUrl === sseUrl) return sharedClient;
  if (connectPromise && sharedSseUrl === sseUrl) return connectPromise;

  if (sharedClient && sharedSseUrl !== sseUrl) {
    await closeSharedClient("sseUrl-changed");
  }

  sharedSseUrl = sseUrl;
  sharedClient = new Client({
    name: "dev-inspector-auto-browser",
    version: "1.0.0",
  });

  const transport = new SSEClientTransport(new URL(sseUrl));
  connectPromise = sharedClient
    .connect(transport)
    .then(() => sharedClient as Client)
    .catch(async error => {
      await closeSharedClient("connect-failed");
      throw error;
    })
    .finally(() => {
      connectPromise = null;
    });

  registerProcessCleanupOnce();
  return connectPromise;
}

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
  const chromeDisabled = isChromeDisabled(serverContext.disableChrome);

  if (chromeDisabled) {
    console.log(
      `[dev-inspector] 📴 Skipping browser launch: Chrome integration disabled (DEV_INSPECTOR_DISABLE_CHROME=1 or disableChrome: true)`,
    );
    return false;
  }

  const host = serverContext.host === "0.0.0.0" ? "localhost" : serverContext.host || "localhost";
  const port = serverContext.port || 5173;
  const sseUrl = `http://${host}:${port}/__mcp__/sse?clientId=browser-launcher-${process.pid}`;

  try {
    const client = await getOrCreateClient(sseUrl);

    // Call chrome_devtools tool to navigate
    await client.callTool({
      name: "chrome_devtools",
      arguments: {
        useTool: "chrome_navigate_page",
        hasDefinitions: ["chrome_navigate_page"],
        chrome_navigate_page: { url },
      },
    });
    return true;
  } catch (error) {
    console.error(
      `[dev-inspector] ⚠️  Failed to auto-open browser:`,
      error instanceof Error ? error.message : String(error),
    );
    return false;
  }
}
