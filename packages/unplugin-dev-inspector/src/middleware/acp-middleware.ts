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
 * Call MCP method via transport and wait for response
 */
function callMcpMethodViaTransport(
  transport: TransportWithMethods,
  method: string,
  params?: unknown
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
      const payloadObj = payload as { id: number; result: unknown };
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
  transport: TransportWithMethods
): Promise<Record<string, any>> {
  const tools: Record<string, any> = {};

  const { tools: toolsListFromServer } = (await callMcpMethodViaTransport(transport, "tools/list")) as {
    tools: ToolInfo[];
  };

  for (const toolInfo of toolsListFromServer) {
    const toolName = toolInfo.name;
    // Create tool with execute function that calls MCP via transport
    tools[toolName] = tool({
      description: toolInfo.description,
      inputSchema: jsonSchema(toolInfo.inputSchema as any),
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

  console.log(
    `[dev-inspector] [acp] Loaded ${Object.keys(tools).length} MCP tools`
  );

  return tools;
}

/**
 * Get an active transport from the connection manager
 */
function getActiveTransport(): TransportWithMethods | null {
  const connectionManager = getConnectionManager();
  if (!connectionManager) {
    return null;
  }
  
  // Get any available transport from the connection manager
  const sessionIds = Object.keys(connectionManager.transports);
  if (sessionIds.length === 0) {
    return null;
  }
  
  // Return the first available transport
  return connectionManager.transports[sessionIds[0]] as TransportWithMethods;
}

export function setupAcpMiddleware(middlewares: Connect.Server, serverContext?: ServerContext, acpOptions?: AcpOptions) {
  middlewares.use(
    "/api/acp/chat",
    async (req: IncomingMessage, res: ServerResponse) => {
      if (handleCors(res, req.method)) return;

      if (req.method !== "POST") {
        res.statusCode = 405;
        res.end("Method Not Allowed");
        return;
      }

      try {
        const body = await readBody(req);
        const { messages, agent, envVars } = JSON.parse(body);

        const cwd = process.cwd();

        // Create ACP provider with empty mcpServers - we'll provide tools directly
        const provider = createACPProvider({
          command: agent.command,
          args: agent.args,
          env: envVars,
          session: {
            cwd,
            mcpServers: [],
          },
          authMethodId: agent.authMethodId,
        });

        // Get active transport from shared connection manager and load tools
        const transport = getActiveTransport();
        let mcpTools: Record<string, any> = {};
        if (transport) {
          mcpTools = await loadMcpToolsV5(transport);
        } else {
          console.warn('[dev-inspector] [acp] No active MCP transport available, tools will not be loaded');
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
        req.on('close', () => {
          console.log('[dev-inspector] [acp] Client disconnected, aborting stream');
          abortController.abort();
          provider.cleanup();
        });

        const result = streamText({
          model: provider.languageModel(model, mode),
          // Ensure raw chunks like agent plan are included for streaming
          includeRawChunks: true,
          messages: convertToModelMessages(messages),
          abortSignal: abortController.signal,
          // Use acpTools to wrap MCP tools with ACP provider dynamic tool
          tools: acpTools(mcpTools),
          onError: (error) => {
            console.error(
              "Error occurred while streaming text:",
              JSON.stringify(error, null, 2)
            );
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
          res.end(JSON.stringify({ error: "Internal Server Error" }));
        }
      }
    }
  );
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
