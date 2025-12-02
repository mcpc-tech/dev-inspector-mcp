import type { Connect } from "vite";
import type { IncomingMessage, ServerResponse } from "http";
import { streamText, convertToModelMessages } from "ai";
import { createACPProvider } from "@mcpc-tech/acp-ai-provider";
import { planEntrySchema } from "@agentclientprotocol/sdk";
import { z } from "zod";
import { resolveMcpRemote } from "../utils/resolve-bin";
import { handleCors } from "../utils/cors";
import type { ServerContext } from "../mcp";
import type { AcpOptions } from "../../client/constants/types";

export type { AcpOptions };

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
        const mcpRemote = resolveMcpRemote(cwd);

        const provider = createACPProvider({
          command: agent.command,
          args: agent.args,
          env: envVars,
          session: {
            cwd,
            // All Agents MUST support the stdio transport, while HTTP and SSE transports are optional capabilities that can be checked during initialization, we use mcp-remote to support it
            // See https://agentclientprotocol.com/protocol/session-setup#mcp-servers
            mcpServers: [
              {
                command: mcpRemote.command,
                args: [
                  ...mcpRemote.args,
                  `http://${serverContext?.host || 'localhost'}:${serverContext?.port || 5173}/__mcp__/sse?puppetId=chrome`,
                ],
                env: [],
                name: "inspect",
              },
            ],
          },
          authMethodId: agent.authMethodId,
        });

        const sessionInfo = await provider.initSession();
        
        // Log available modes and models from session info
        console.log('[dev-inspector] [acp] Session initialized');
        if (sessionInfo.modes) {
          const { availableModes, currentModeId } = sessionInfo.modes;
          console.log('[dev-inspector] [acp] Available modes:', availableModes.map(m => m.id).join(', '));
          console.log('[dev-inspector] [acp] Current mode:', currentModeId);
        }
        if (sessionInfo.models) {
          const { availableModels, currentModelId } = sessionInfo.models;
          console.log('[dev-inspector] [acp] Available models:', availableModels.map(m => m.modelId).join(', '));
          console.log('[dev-inspector] [acp] Current model:', currentModelId);
        }
        
        // Only set mode/model/delay if options are explicitly specified
        // Agent-specific options take precedence over global options
        const mode = agent.acpMode ?? acpOptions?.acpMode;
        const model = agent.acpModel ?? acpOptions?.acpModel;
        const delay = agent.acpDelay ?? acpOptions?.acpDelay;
        
        if (mode !== undefined) {
          await provider.setMode(mode);
        }
        if (model !== undefined) {
          await provider.setModel(model);
        }
        if (delay !== undefined && delay > 0) {
          console.log(`[dev-inspector] [acp] Delaying response by ${delay}ms, agent: ${agent.name}`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        } 

        const result = streamText({
          model: provider.languageModel(),
          // Ensure raw chunks like agent plan are included for streaming
          includeRawChunks: true,
          messages: convertToModelMessages(messages),
          // onChunk: (chunk) => {
          //   // console.log("Streamed chunk:", chunk);
          // },
          onError: (error) => {
            console.error(
              "Error occurred while streaming text:",
              JSON.stringify(error, null, 2)
            );
          },
          tools: provider.tools,
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
