import type { Connect } from "vite";
import type { IncomingMessage, ServerResponse } from "http";
import { streamText, convertToModelMessages, tool, jsonSchema } from "ai";
import { createACPProvider, acpTools } from "@mcpc-tech/acp-ai-provider";
import { planEntrySchema } from "@agentclientprotocol/sdk";
import { z } from "zod";
import { handleCors } from "../utils/cors";
import type { ServerContext } from "../mcp";
import type { AcpOptions } from "../../client/constants/types";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { getConnectionManager } from "./mcproute-middleware";

export type { AcpOptions };

interface ToolInfo {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

type TransportWithMethods = {
  onmessage?: (message: JSONRPCMessage) => void;
  send: (payload: JSONRPCMessage) => Promise<void>;
};

/**
 * Session info for tracking initialized sessions
 */
interface SessionInfo {
  sessionId: string;
  createdAt: number;
}

/**
 * Provider entry - one provider per agent config, multiple sessions
 */
interface ProviderEntry {
  provider: ReturnType<typeof createACPProvider>;
  agentKey: string;
  sessions: Map<string, SessionInfo>;
  createdAt: number;
  initializationPromise?: Promise<string>; // Promise that resolves to sessionId
}

/**
 * Provider manager - stores one provider per agent config
 * Key: agentKey (command:args), Value: ProviderEntry
 */
const providerManager = new Map<string, ProviderEntry>();

/**
 * Session to provider mapping for quick lookup
 * Key: sessionId, Value: agentKey
 */
const sessionToProvider = new Map<string, string>();

/**
 * Generate a unique key for an agent configuration
 */
function getAgentKey(command: string, args?: string[]): string {
  return `${command}:${(args || []).join(",")}`;
}

/**
 * Call MCP method via transport and wait for response
 */
function callMcpMethodViaTransport(
  transport: TransportWithMethods,
  method: string,
  params?: unknown,
): Promise<unknown> {
  const messageId = Date.now();
  const message = {
    method,
    params: params as Record<string, unknown>,
    jsonrpc: "2.0" as const,
    id: messageId,
  };

  return new Promise((resolve) => {
    transport.onmessage?.(message as JSONRPCMessage);

    const originalSend = transport.send;
    transport.send = function (payload: JSONRPCMessage) {
      const payloadObj = payload as {
        id: number;
        result: unknown;
      };
      if (payloadObj.id === messageId) {
        resolve(payloadObj.result);
        transport.send = originalSend;
      }
      return originalSend.call(this, payload);
    };
  });
}

/**
 * Load MCP tools from transport in AI SDK v5 format
 */
async function loadMcpToolsV5(transport: TransportWithMethods): Promise<Record<string, any>> {
  const tools: Record<string, any> = {};

  const { tools: toolsListFromServer } = (await callMcpMethodViaTransport(
    transport,
    "tools/list",
  )) as {
    tools: ToolInfo[];
  };

  for (const toolInfo of toolsListFromServer) {
    const toolName = toolInfo.name;
    // Create tool with execute function that calls MCP via transport
    tools[toolName] = tool({
      description: toolInfo.description,
      inputSchema: jsonSchema(toolInfo.inputSchema),
      execute: async (args: unknown) => {
        console.log(`[dev-inspector] [acp] Executing MCP tool: ${toolName}`);
        const result = await callMcpMethodViaTransport(transport, "tools/call", {
          name: toolName,
          arguments: args,
        });
        return result;
      },
    });
  }

  console.log(`[dev-inspector] [acp] Loaded ${Object.keys(tools).length} MCP tools`);

  return tools;
}

/**
 * Build session context with actionable guidance for the AI
 * Returns minimal hints about current state without duplicating tool descriptions
 */
async function buildSessionContext(transport: TransportWithMethods | null): Promise<string | null> {
  if (!transport) return null;

  try {
    // Check if there are any pending inspections
    const result = (await callMcpMethodViaTransport(transport, "tools/call", {
      name: "list_inspections",
      arguments: {},
    })) as { content: { text: string }[] };

    const text = result?.content?.[0]?.text || "";

    // If no inspections, no context needed
    if (text.includes("No Inspection Items") || !text.includes("Status:")) {
      return null;
    }

    // Count pending/in-progress items
    const pendingCount = (text.match(/Status: (PENDING|IN-PROGRESS|LOADING)/gi) || []).length;

    if (pendingCount === 0) return null;

    // Return minimal, actionable hint
    return `# Session Context

There ${pendingCount === 1 ? "is 1 inspection" : `are ${pendingCount} inspections`} waiting in the queue.
You may want to check them with \`list_inspections\` and ask the user if they need help fixing any issues.`;
  } catch (e) {
    console.log("[dev-inspector] [acp] Failed to build session context:", e);
    return null;
  }
}

/**
 * Get an active transport from the connection manager
 */
/**
 * Get an active transport from the connection manager
 */
function getActiveTransport(): TransportWithMethods | null {
  const connectionManager = getConnectionManager();
  if (!connectionManager) {
    return null;
  }
  // Use inspector transport if available, otherwise fallback to any transport
  return (
    (connectionManager.getInspectorTransport() as TransportWithMethods) ||
    (connectionManager.transports[Object.keys(connectionManager.transports)[0]] as TransportWithMethods)
  );
}

/**
 * Get specifically the inspector transport for context and tools
 */
function getInspectorTransport(): TransportWithMethods | null {
  const connectionManager = getConnectionManager();
  return connectionManager ? (connectionManager.getInspectorTransport() as TransportWithMethods) : null;
}

export function setupAcpMiddleware(
  middlewares: Connect.Server,
  serverContext?: ServerContext,
  acpOptions?: AcpOptions,
) {
  /**
   * Initialize a session for an agent
   * POST /api/acp/init-session
   * Body: { agent, envVars }
   * Returns: { sessionId }
   */
  middlewares.use("/api/acp/init-session", async (req: IncomingMessage, res: ServerResponse) => {
    if (handleCors(res, req.method)) return;

    if (req.method !== "POST") {
      res.statusCode = 405;
      res.end("Method Not Allowed");
      return;
    }

    try {
      const body = await readBody(req);
      const { agent, envVars } = JSON.parse(body);

      const cwd = process.cwd();
      const agentKey = getAgentKey(agent.command, agent.args);

      console.log(
        `[dev-inspector] [acp] Requesting session for agent: ${agent.name} (${agentKey})`,
      );

      let providerEntry = providerManager.get(agentKey);
      let sessionId: string = "";

      if (providerEntry) {
        // 1. If we have active sessions, return the first one immediately (Reuse logic)
        if (providerEntry.sessions.size > 0) {
          const firstSession = providerEntry.sessions.values().next().value;
          if (firstSession) {
            sessionId = firstSession.sessionId;
            console.log(
              `[dev-inspector] [acp] Reusing existing session: ${sessionId} for ${agent.name}`,
            );
          }
        }

        // 2. If initialization is in progress (race condition), join the promise
        if (!sessionId && providerEntry.initializationPromise) {
          console.log(`[dev-inspector] [acp] Joining pending initialization for ${agent.name}`);
          try {
            sessionId = await providerEntry.initializationPromise;
          } catch (e) {
            // If pending failed, throw the error
            throw e;
          }
        }
      }

      // 3. If still no session, create new one
      if (!sessionId) {
        let provider: ReturnType<typeof createACPProvider>;

        if (providerEntry) {
          console.log(`[dev-inspector] [acp] Reusing existing provider for ${agent.name}`);
          provider = providerEntry.provider;
        } else {
          console.log(`[dev-inspector] [acp] Creating new global provider for ${agent.name}`);
          // Create ACP provider with persistSession enabled
          provider = createACPProvider({
            command: agent.command,
            args: agent.args,
            env: { ...process.env, ...envVars },
            session: {
              cwd,
              mcpServers: [],
            },
            authMethodId: agent.authMethodId,
            persistSession: true,
          });

          providerEntry = {
            provider,
            agentKey,
            sessions: new Map(),
            createdAt: Date.now(),
            initializationPromise: undefined,
          };
          providerManager.set(agentKey, providerEntry);
        }

        // Initialize the session ONLY if we don't have one
        console.log(`[dev-inspector] [acp] Spawning new process/session for ${agent.name}`);

        // Create a promise for this initialization
        const initPromise = (async () => {
          // Pre-load tools if transport is available
          const transport = getInspectorTransport() || getActiveTransport();
          let initialTools: Record<string, any> = {};
          if (transport) {
            try {
              const rawTools = await loadMcpToolsV5(transport);
              initialTools = acpTools(rawTools);
              console.log(
                `[dev-inspector] [acp] Pre-loading ${Object.keys(rawTools).length} tools for session init`,
              );
            } catch (e) {
              console.warn("[dev-inspector] [acp] Failed to pre-load tools:", e);
            }
          }

          const session = await provider.initSession(initialTools);
          const sid =
            session.sessionId ||
            `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

          if (providerEntry) {
            providerEntry.sessions.set(sid, {
              sessionId: sid,
              createdAt: Date.now(),
            });
            providerEntry.initializationPromise = undefined;
          }
          sessionToProvider.set(sid, agentKey);
          return sid;
        })();

        // Store the promise so others can join
        if (providerEntry) {
          providerEntry.initializationPromise = initPromise;
        }

        try {
          sessionId = await initPromise;
          console.log(`[dev-inspector] [acp] Session initialized: ${sessionId}`);
        } catch (error) {
          if (providerEntry) providerEntry.initializationPromise = undefined; // Clear if failed
          throw error;
        }
      }

      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ sessionId }));
    } catch (error) {
      console.error("ACP Init Session Error:", error);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end(
          JSON.stringify({
            error: error instanceof Error ? error.message : "Internal Server Error",
          }),
        );
      }
    }
  });

  /**
   * Cleanup a session
   * POST /api/acp/cleanup-session
   * Body: { sessionId }
   */
  middlewares.use("/api/acp/cleanup-session", async (req: IncomingMessage, res: ServerResponse) => {
    if (handleCors(res, req.method)) return;

    if (req.method !== "POST") {
      res.statusCode = 405;
      res.end("Method Not Allowed");
      return;
    }

    try {
      const body = await readBody(req);
      const { sessionId } = JSON.parse(body);

      const agentKey = sessionToProvider.get(sessionId);
      if (agentKey) {
        const providerEntry = providerManager.get(agentKey);
        if (providerEntry) {
          console.log(
            `[dev-inspector] [acp] Cleaning up session: ${sessionId} (Provider sessions left: ${providerEntry.sessions.size - 1})`,
          );
          providerEntry.sessions.delete(sessionId);

          // Cleanup provider if no sessions left to save memory and ensure stability (restarting unstable agents like Droid)
          if (providerEntry.sessions.size === 0) {
            console.log(
              `[dev-inspector] [acp] No active sessions for ${agentKey}, cleaning up provider`,
            );
            try {
              providerEntry.provider.cleanup();
            } catch (e) {
              console.error("Error cleaning up provider:", e);
            }
            providerManager.delete(agentKey);
          }
        }
        sessionToProvider.delete(sessionId);
      }

      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ success: true }));
    } catch (error) {
      console.error("ACP Cleanup Session Error:", error);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: "Internal Server Error" }));
      }
    }
  });

  /**
   * Chat endpoint
   * POST /api/acp/chat
   * Body: { messages, agent, envVars, sessionId? }
   */
  middlewares.use("/api/acp/chat", async (req: IncomingMessage, res: ServerResponse) => {
    if (handleCors(res, req.method)) return;

    if (req.method !== "POST") {
      res.statusCode = 405;
      res.end("Method Not Allowed");
      return;
    }

    try {
      const body = await readBody(req);
      const { messages, agent, envVars, sessionId } = JSON.parse(body);

      const cwd = process.cwd();

      // Try to get existing session from session manager
      let provider: ReturnType<typeof createACPProvider>;
      let shouldCleanupProvider = true; // Track if we should cleanup on disconnect

      // Lookup provider by sessionId or find global provider (if sessionId is just for tracking)
      let existingProviderEntry: ProviderEntry | undefined;

      if (sessionId) {
        const agentKey = sessionToProvider.get(sessionId);
        if (agentKey) {
          existingProviderEntry = providerManager.get(agentKey);
        }
      }

      if (existingProviderEntry) {
        console.log(
          `[dev-inspector] [acp] Using existing global provider for session: ${sessionId}`,
        );
        provider = existingProviderEntry.provider;
        shouldCleanupProvider = false; // Don't cleanup managed global providers
      } else {
        // Fallback: Create new provider (backward compatibility or missing session)
        console.log(`[dev-inspector] [acp] Creating new provider (no session found or provided)`);
        provider = createACPProvider({
          command: agent.command,
          args: agent.args,
          env: { ...process.env, ...envVars },
          session: {
            cwd,
            mcpServers: [],
          },
          authMethodId: agent.authMethodId,
        });
        // Initialize session if no existing session
        await provider.initSession();
      }

      // Get active transport from shared connection manager and load tools
      // Prefer inspector transport for tools
      const transport = getInspectorTransport() || getActiveTransport();
      let mcpTools: Record<string, any> = {};
      if (transport) {
        mcpTools = await loadMcpToolsV5(transport);
      } else {
        console.warn(
          "[dev-inspector] [acp] No active MCP transport available, tools will not be loaded",
        );
      }

      // Get mode/model/delay options
      const mode = agent.acpMode ?? acpOptions?.acpMode;
      const model = agent.acpModel ?? acpOptions?.acpModel;
      const delay = agent.acpDelay ?? acpOptions?.acpDelay;

      if (delay !== undefined && delay > 0) {
        console.log(`[dev-inspector] [acp] Delaying response by ${delay}ms, agent: ${agent.name}`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      // Create abort controller for request cancellation
      const abortController = new AbortController();

      // Listen for client disconnect to cancel the stream
      req.on("close", () => {
        console.log("[dev-inspector] [acp] Client disconnected, aborting stream");
        abortController.abort();
        if (shouldCleanupProvider) {
          provider.cleanup();
        }
      });

      // Build session context and prepend as system message if available
      // ALWAYS use inspector transport for context to get actual DOM state
      const sessionContext = await buildSessionContext(getInspectorTransport());
      console.log(`[dev-inspector] [acp] sessionContext`, sessionContext)
      const contextualMessages = sessionContext
        ? [{ role: "system" as const, content: sessionContext }, ...messages]
        : messages;

      const result = streamText({
        model: provider.languageModel(model, mode),
        // Ensure raw chunks like agent plan are included for streaming
        includeRawChunks: true,
        messages: convertToModelMessages(contextualMessages),
        abortSignal: abortController.signal,
        // Use acpTools to wrap MCP tools with ACP provider dynamic tool
        tools: acpTools(mcpTools),
        onError: (error) => {
          console.error("Error occurred while streaming text:", JSON.stringify(error, null, 2));
          provider.cleanup();
        },
      });

      const response = result.toUIMessageStreamResponse({
        messageMetadata: ({ part }) => {
          // Extract plan from raw chunks if available,
          // raw chunks are not included in UI message streams
          if (part.type === "raw" && part.rawValue) {
            const parsed = z
              .string()
              .transform((str) => {
                try {
                  return JSON.parse(str);
                } catch {
                  return null;
                }
              })
              .pipe(z.array(planEntrySchema).optional())
              .safeParse(part.rawValue);

            if (parsed.success && parsed.data) {
              return { plan: parsed.data };
            }
          }
        },
        onError: (error) => {
          console.error("Stream error:", error);
          return error instanceof Error ? error.message : String(error);
        },
      });

      // Copy headers
      response.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });

      // Stream body
      if (response.body) {
        const reader = response.body.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
          }
        } finally {
          res.end();
        }
      } else {
        res.end();
      }
    } catch (error) {
      console.error("ACP Middleware Error:", error);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end(
          JSON.stringify({
            error: "Internal Server Error",
          }),
        );
      }
    }
  });
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      resolve(body);
    });
    req.on("error", (err) => {
      reject(err);
    });
  });
}
