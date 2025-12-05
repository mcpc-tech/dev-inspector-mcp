import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { IncomingMessage, ServerResponse } from "http";
import { randomUUID } from "crypto";
import type { Connect } from "vite";
import { createInspectorMcpServer, type ServerContext } from "../mcp";
import { ConnectionManager } from "./connection-manager.js";
import { handleCors } from "../utils/cors";

/**
 * Setup MCP server endpoints in Vite dev server
 */
export async function setupMcpMiddleware(middlewares: Connect.Server, serverContext?: ServerContext) {
  const connectionManager = new ConnectionManager();

  middlewares.use(
    async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
      const url = req.url || "";

      // Handle CORS for MCP endpoints
      if (url.startsWith("/__mcp__")) {
        if (handleCors(res, req.method)) return;
      }

      // Streamable HTTP endpoint
      if (
        url.startsWith("/__mcp__") &&
        !url.startsWith("/__mcp__/sse") &&
        !url.startsWith("/__mcp__/messages")
      ) {
        if (req.method === "POST") {
          await handleStreamableHttpPost(req, res, serverContext, connectionManager);
        } else if (req.method === "GET") {
          await handleStreamableHttpGet(req, res, connectionManager);
        } else if (req.method === "DELETE") {
          await handleStreamableHttpDelete(req, res, connectionManager);
        } else {
          res.writeHead(405).end("Method Not Allowed");
        }
        return;
      }

      // SSE endpoint (deprecated)
      if (url.startsWith("/__mcp__/sse") && req.method === "GET") {
        await handleSseConnection(req, res, serverContext, connectionManager);
        return;
      }

      // SSE messages endpoint (deprecated)
      if (url.startsWith("/__mcp__/messages") && req.method === "POST") {
        await handleSseMessage(req, res, serverContext, connectionManager);
        return;
      }

      next();
    }
  );
}

/**
 * Handle Streamable HTTP POST requests
 */
async function handleStreamableHttpPost(
  req: IncomingMessage,
  res: ServerResponse,
  serverContext: ServerContext | undefined,
  connectionManager: ConnectionManager
) {
  try {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    // Read request body
    const body = await readRequestBody(req);
    const parsedBody = JSON.parse(body);

    const existingTransport = sessionId ? connectionManager.getTransport(sessionId) : undefined;

    if (sessionId && existingTransport) {
      if (existingTransport instanceof StreamableHTTPServerTransport) {
        transport = existingTransport;
      } else {
        res.writeHead(400, { "Content-Type": "application/json" }).end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: {
              code: -32000,
              message: "Session exists but uses a different transport protocol",
            },
            id: null,
          })
        );
        return;
      }
    } else if (!sessionId && isInitializeRequest(parsedBody)) {
      // New session - only create MCP server here
      const mcpServer = await createInspectorMcpServer(serverContext);
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          connectionManager.registerTransport(sid, transport);
        },
        enableJsonResponse: false,
      });

      transport.onclose = () => {
        if (transport.sessionId) {
          connectionManager.removeTransport(transport.sessionId);
        }
      };

      await mcpServer.connect(transport);
    } else {
      res.writeHead(400, { "Content-Type": "application/json" }).end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Invalid session ID or not an initialize request",
          },
          id: null,
        })
      );
      return;
    }

    await transport.handleRequest(req, res, parsedBody);
  } catch (error) {
    console.error("Error handling Streamable HTTP POST:", error);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" }).end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal server error",
          },
          id: null,
        })
      );
    }
  }
}

/**
 * Handle Streamable HTTP GET requests (SSE stream)
 */
async function handleStreamableHttpGet(
  req: IncomingMessage,
  res: ServerResponse,
  connectionManager: ConnectionManager
) {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (!sessionId) {
    res.writeHead(400).end("Invalid or missing session ID");
    return;
  }

  const transport = connectionManager.getTransport(sessionId);
  if (!transport) {
    res.writeHead(400).end("Invalid or missing session ID");
    return;
  }
  if (!(transport instanceof StreamableHTTPServerTransport)) {
    res.writeHead(400).end("Session uses different transport");
    return;
  }

  await transport.handleRequest(req, res);
}

/**
 * Handle Streamable HTTP DELETE requests
 */
async function handleStreamableHttpDelete(
  req: IncomingMessage,
  res: ServerResponse,
  connectionManager: ConnectionManager
) {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (!sessionId) {
    res.writeHead(404).end("Session not found");
    return;
  }

  const transport = connectionManager.getTransport(sessionId);
  if (!transport) {
    res.writeHead(404).end("Session not found");
    return;
  }
  if (!(transport instanceof StreamableHTTPServerTransport)) {
    res.writeHead(400).end("Session uses different transport");
    return;
  }

  await transport.handleRequest(req, res);
}

/**
 * Handle SSE connection (deprecated)
 */
async function handleSseConnection(
  req: IncomingMessage,
  res: ServerResponse,
  serverContext: ServerContext | undefined,
  connectionManager: ConnectionManager
) {
  try {
    // Create MCP server for this SSE connection
    const mcpServer = await createInspectorMcpServer(serverContext);
    // Use injected serverContext for local dev server address
    const host = serverContext?.host || "localhost";
    const port = serverContext?.port || 5173;
    const url = new URL(req.url ?? "", `http://${host}:${port}`);
    const transport = new SSEServerTransport("/__mcp__/messages", res);
    const sessionId = transport.sessionId;
    // Default clientId to "agent" for watcher connections without explicit clientId
    const clientId = url.searchParams.get("clientId") || "agent";
    const puppetId = url.searchParams.get("puppetId") || "inspector";

    connectionManager.registerTransport(sessionId, transport);

    if (clientId === "inspector") {
      connectionManager.handleInspectorConnection(sessionId);
    } else {
      // Watcher connection: bind to inspector
      connectionManager.handleWatcherConnection(sessionId, clientId, puppetId, transport);
    }

    await mcpServer.connect(transport);
  } catch (error) {
    console.error("Error establishing SSE connection:", error);
    if (!res.headersSent) {
      res.writeHead(500).end("Error establishing SSE stream");
    }
  }
}

/**
 * Handle SSE message (deprecated)
 */
async function handleSseMessage(
  req: IncomingMessage,
  res: ServerResponse,
  serverContext: ServerContext | undefined,
  connectionManager: ConnectionManager
) {
  try {
    // Use injected serverContext for local dev server address
    const host = serverContext?.host || "localhost";
    const port = serverContext?.port || 5173;
    const url = new URL(req.url || "", `http://${host}:${port}`);
    const sessionId = url.searchParams.get("sessionId");

    if (!sessionId) {
      res.writeHead(400).end("Missing sessionId parameter");
      return;
    }

    const transport = connectionManager.getTransport(sessionId);
    if (!transport || !(transport instanceof SSEServerTransport)) {
      res.writeHead(404).end("Session not found or wrong transport type");
      return;
    }

    const body = await readRequestBody(req);
    const parsedBody = JSON.parse(body);

    await transport.handlePostMessage(req, res, parsedBody);
  } catch (error) {
    console.error("Error handling SSE message:", error);
    if (!res.headersSent) {
      res.writeHead(500).end("Internal server error");
    }
  }
}

/**
 * Helper to read request body
 */
function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      resolve(body);
    });
    req.on("error", reject);
  });
}

/**
 * Helper to check if request is an initialize request
 */
function isInitializeRequest(body: any): boolean {
  return body && body.method === "initialize" && body.jsonrpc === "2.0";
}
