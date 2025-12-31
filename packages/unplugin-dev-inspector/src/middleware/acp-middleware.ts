import type { Connect } from "vite";
import type { IncomingMessage, ServerResponse } from "http";
import { execSync } from "child_process";
import { streamText, convertToModelMessages, tool, jsonSchema } from "ai";
import { createACPProvider, acpTools } from "@mcpc-tech/acp-ai-provider";
import { planEntrySchema } from "@agentclientprotocol/sdk";
import { z } from "zod";
import { handleCors } from "../utils/cors";

import { contextSelectorTool } from "./tools/context-selector";
import type { ServerContext } from "../mcp";
import type { AcpOptions } from "../../client/constants/types";
import { CallToolResultSchema, type JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { getConnectionManager } from "./mcproute-middleware";
import { resolveNpmPackageBin } from "../utils/npm-package";

export type { AcpOptions };

/**
 * Check if a command exists in the system PATH
 * Skips check for npx since it always exists
 */
function checkCommandExists(command: string): boolean {
  if (command === "npx" || command === "node") {
    return true; // npx and node are always available
  }
  try {
    execSync(`which ${command}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

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
 * Provider entry - one provider per session (request-scoped)
 */
interface ProviderEntry {
  provider: ReturnType<typeof createACPProvider>;
  createdAt: number;
}

/**
 * Session-scoped provider manager
 * Key: sessionId, Value: ProviderEntry
 */
const sessionProviders = new Map<string, ProviderEntry>();

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
async function loadMcpToolsV5(
  getTransport: () => TransportWithMethods | null,
): Promise<Record<string, any>> {
  const tools: Record<string, any> = {};

  const initialTransport = getTransport();
  if (!initialTransport) {
    console.warn(
      "[dev-inspector] [acp] No active MCP transport available, tools will not be loaded",
    );
    return tools;
  }

  const { tools: toolsListFromServer } = (await callMcpMethodViaTransport(
    initialTransport,
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
        const transport = getTransport();
        if (!transport) {
          throw new Error("No active MCP transport available");
        }
        console.log(`[dev-inspector] [acp] Executing MCP tool: ${toolName}`);
        const result = await callMcpMethodViaTransport(transport, "tools/call", {
          name: toolName,
          arguments: args,
        });
        const parsedResult = CallToolResultSchema.safeParse(result);
        if (!parsedResult.success) {
          return result;
        }
        // TODO: handle more than text content
        return parsedResult.data?.content?.map((item) => item?.text).join("\n");
      },
    });
  }

  console.log(`[dev-inspector] [acp] Loaded ${Object.keys(tools).length} MCP tools`);

  return tools;
}

/**
 * Default system instructions for DevInspector - provides AI guidance
 */
const DEFAULT_SYSTEM_INSTRUCTIONS = `# DevInspector Context

You are connected to a web app with DevInspector. Available tools:

- **list_inspections**: Check pending element inspections from user
- **capture_element_context**: Activate visual selector to capture UI elements
- **update_inspection_status**: Update inspection status with progress/results
- **execute_page_script**: Run JavaScript in browser context
- **chrome_devtools**: Access Chrome DevTools for network, console, performance

Workflow: Check \`list_inspections\` first. If there are pending items, help resolve them. Otherwise, assist with the user's request.`;

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
    (connectionManager.transports[
      Object.keys(connectionManager.transports)[0]
    ] as TransportWithMethods)
  );
}

/**
 * Get specifically the inspector transport for context and tools
 */
function getInspectorTransport(): TransportWithMethods | null {
  const connectionManager = getConnectionManager();
  return connectionManager
    ? (connectionManager.getInspectorTransport() as TransportWithMethods)
    : null;
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
    if (handleCors(req, res)) return;

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
        `[dev-inspector] [acp] Creating request-scoped session for agent: ${agent.name} (${agentKey})`,
      );

      // Request-scoped behavior: always create a fresh provider/session.
      // Check if command exists before attempting to spawn
      if (!checkCommandExists(agent.command)) {
        const hints: string[] = [`Agent "${agent.name}" command not found: "${agent.command}"`];
        if (agent.installCommand) {
          hints.push(`Install with: ${agent.installCommand}`);
        }
        if (agent.configHint) {
          hints.push(agent.configHint);
        }
        if (agent.configLink) {
          hints.push(`Documentation: ${agent.configLink}`);
        }
        console.error(`\n${hints.join("\n")}\n`);
        res.statusCode = 400;
        res.end(JSON.stringify({ error: hints.join("\n") }));
        return;
      }

      // Try to resolve npm package bin if npmPackage is specified
      let command = agent.command;
      let args = agent.args;
      if (agent.npmPackage) {
        const binPath = resolveNpmPackageBin(agent.npmPackage);
        if (binPath) {
          command = binPath;
          args = agent.npmArgs || [];
          console.log(`[dev-inspector] [acp] Using resolved npm package: ${agent.npmPackage}`);
        } else {
          console.log(
            `[dev-inspector] [acp] Failed to resolve npm package, falling back to: ${agent.command}`,
          );
        }
      }

      const provider = createACPProvider({
        command,
        args,
        env: { ...process.env, ...envVars },
        session: {
          cwd,
          mcpServers: [],
        },
        authMethodId: agent.authMethodId,
      });

      console.log(`[dev-inspector] [acp] Spawning new process/session for ${agent.name}`);

      // Pre-load tools if transport is available
      const getTransport = () => getInspectorTransport() || getActiveTransport();
      let initialTools: Record<string, any> = {};
      try {
        const rawTools = await loadMcpToolsV5(getTransport);
        if (Object.keys(rawTools).length > 0) {
          initialTools = acpTools(rawTools);
          console.log(
            `[dev-inspector] [acp] Pre-loading ${Object.keys(rawTools).length} tools for session init`,
          );
        }
      } catch (e) {
        console.warn("[dev-inspector] [acp] Failed to pre-load tools:", e);
      }

      const session = await provider.initSession(initialTools);
      const sessionId =
        session.sessionId || `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      sessionProviders.set(sessionId, {
        provider,
        createdAt: Date.now(),
      });
      console.log(`[dev-inspector] [acp] Session initialized: ${sessionId}`);

      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ sessionId }));
    } catch (error) {
      // Re-throw command not found errors to exit the server
      if (error instanceof Error && error.message.includes("command not found")) {
        throw error;
      }

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
    if (handleCors(req, res)) return;

    if (req.method !== "POST") {
      res.statusCode = 405;
      res.end("Method Not Allowed");
      return;
    }

    try {
      const body = await readBody(req);
      const { sessionId } = JSON.parse(body);

      const providerEntry = sessionProviders.get(sessionId);
      if (providerEntry) {
        console.log(`[dev-inspector] [acp] Cleaning up session-scoped provider: ${sessionId}`);
        try {
          providerEntry.provider.cleanup();
        } catch (e) {
          console.error("Error cleaning up provider:", e);
        }
        sessionProviders.delete(sessionId);
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
    if (handleCors(req, res)) return;

    if (req.method !== "POST") {
      res.statusCode = 405;
      res.end("Method Not Allowed");
      return;
    }

    try {
      const body = await readBody(req);
      const { messages, agent, envVars, sessionId, isAutomated, inferContext } = JSON.parse(body);

      const cwd = process.cwd();

      // Try to get existing request-scoped session (by sessionId)
      // BUT: In inferContext mode, always create new provider because existing session
      // has inspector tools registered, not context_selector
      let provider: ReturnType<typeof createACPProvider>;
      let shouldCleanupProvider = true; // Track if we should cleanup on disconnect

      const existingProviderEntry =
        sessionId && !inferContext ? sessionProviders.get(sessionId) : undefined;
      if (existingProviderEntry) {
        console.log(
          `[dev-inspector] [acp] Using existing session-scoped provider for session: ${sessionId}`,
        );
        provider = existingProviderEntry.provider;
        shouldCleanupProvider = false; // Cleanup happens via /cleanup-session
      } else {
        // Create new provider (backward compatibility, missing session, or inferContext mode)
        console.log(
          `[dev-inspector] [acp] Creating new provider${inferContext ? " (inferContext mode)" : " (no session found or provided)"}`,
        );

        // Try to resolve npm package bin if npmPackage is specified
        let command = agent.command;
        let args = agent.args;
        if (agent.npmPackage) {
          const binPath = resolveNpmPackageBin(agent.npmPackage);
          if (binPath) {
            command = binPath;
            args = agent.npmArgs || [];
            console.log(`[dev-inspector] [acp] Using resolved npm package: ${agent.npmPackage}`);
          }
        }

        provider = createACPProvider({
          command,
          args,
          env: { ...process.env, ...envVars },
          session: {
            cwd,
            mcpServers: [],
          },
          authMethodId: agent.authMethodId,
        });
        // Initialize session - in inferContext mode, pass context_selector tool directly
        if (inferContext) {
          await provider.initSession(
            acpTools({ context_selector: contextSelectorTool } as Record<string, any>),
          );
        } else {
          await provider.initSession();
        }
      }

      // Get active transport from shared connection manager and load tools
      // Prefer inspector transport for tools
      let mcpTools: Record<string, any> = {};
      const getTransport = () => getInspectorTransport() || getActiveTransport();

      // In inferContext mode, only load context_selector tool (no MCP tools needed)
      if (inferContext) {
        console.log("[dev-inspector] [acp] Context inference mode - adding context_selector tool");
        mcpTools = {
          context_selector: contextSelectorTool,
        };
      } else {
        mcpTools = await loadMcpToolsV5(getTransport);
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

      res.on("close", () => {
        if (!abortController.signal.aborted) {
          console.log("[dev-inspector] [acp] Client disconnected, aborting stream");
          abortController.abort();
          if (shouldCleanupProvider) {
            provider.cleanup();
          }
        }
      });

      // Get system prompt: agent config > acpOptions > default
      const systemPrompt =
        agent.acpSystemPrompt ?? acpOptions?.acpSystemPrompt ?? DEFAULT_SYSTEM_INSTRUCTIONS;

      // Merge system prompt into the first user message
      const modelMessages = convertToModelMessages(messages);
      const enhancedMessages = modelMessages.map((msg: any, index: number) => {
        if (index === 0 && msg.role === "user" && Array.isArray(msg.content)) {
          return {
            ...msg,
            content: [
              {
                type: "text",
                text: `<system_instructions>
${systemPrompt}
${isAutomated ? "" : "Currently chrome devtools automation is disabled. You do not have access to Console/Network context."}
</system_instructions>
`,
              },
              ...msg.content,
            ],
          };
        }
        return msg;
      });

      const result = streamText({
        model: provider.languageModel(model, mode),
        // Ensure raw chunks like agent plan are included for streaming
        includeRawChunks: true,
        messages: enhancedMessages,
        abortSignal: abortController.signal,
        // Use acpTools to wrap MCP tools with ACP provider dynamic tool
        tools: acpTools(mcpTools),
        onError: (error) => {
          console.error("Error occurred while streaming text:", JSON.stringify(error, null, 2));
          if (shouldCleanupProvider) {
            provider.cleanup();
          }
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
