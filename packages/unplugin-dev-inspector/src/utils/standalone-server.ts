import http from "node:http";
import type { Connect } from "vite";

export interface StandaloneServerOptions {
  port?: number;
  host?: string | boolean;
  allowedHosts?: string[];
}

/**
 * Default port for the standalone server.
 * Can be overridden via DEV_INSPECTOR_PORT environment variable.
 */
export const DEFAULT_PORT = 5137;

/**
 * Get the configured port from environment variable or default.
 */
export function getDefaultPort(): number {
  const envPort = process.env.DEV_INSPECTOR_PORT;
  if (envPort) {
    const parsed = parseInt(envPort, 10);
    if (!isNaN(parsed) && parsed > 0 && parsed < 65536) {
      return parsed;
    }
  }
  return DEFAULT_PORT;
}

// Basic Connect-compatible server implementation
export class StandaloneServer {
  private server: http.Server;
  private middlewares: {
    route: string;
    handle: Connect.NextHandleFunction;
  }[] = [];
  public port: number = 0;
  public host: string = "localhost";
  public stack: any[] = []; // Connect.Server property partial implementation

  public allowedHosts: string[] = [];

  constructor() {
    this.server = http.createServer(async (req, res) => {
      // Host header check
      if (this.allowedHosts.length > 0) {
        const hostHeader = req.headers.host;
        if (hostHeader) {
          const hostname = hostHeader.split(':')[0];
          // Allow localhost/127.0.0.1 by default if they are accessing via those IPs even if not in allowedHosts? 
          // Better to stick to strict check if allowedHosts is provided.
          const isAllowed = this.allowedHosts.some(allowed => {
            if (allowed.startsWith('.')) {
              return hostname.endsWith(allowed) || hostname === allowed.slice(1);
            }
            return hostname === allowed;
          });

          if (!isAllowed) {
            // Check if it's localhost access which is usually safe?
            // Vite allows localhost access even if allowedHosts is set, usually.
            // But specifically for 0.0.0.0, we want to restrict external access.
            // Let's keep it simple: if allowedHosts is set, MUST match.

            // Exception: always allow localhost references for local tools?
            const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';

            if (!isAllowed && !isLocal) {
              res.statusCode = 403;
              res.end('Host Restricted');
              return;
            }
          }
        }
      }

      // Ping route
      if (req.url === '/ping') {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/plain');
        res.end('pong');
        return;
      }

      // Basic middleware runner
      let index = 0;
      const next = async () => {
        if (index >= this.middlewares.length) {
          if (!res.writableEnded) {
            res.statusCode = 404;
            res.end("Not Found");
          }
          return;
        }

        const layer = this.middlewares[index++];
        const url = req.url || "/";

        if (url.startsWith(layer.route)) {
          try {
            const originalUrl = req.url;
            // Strip route prefix if needed for nested apps (simplistic)
            if (layer.route !== "/" && req.url) {
              // req.url = req.url.slice(layer.route.length) || '/';
            }

            await layer.handle(req, res, next);

            if (layer.route !== "/") {
              req.url = originalUrl;
            }
          } catch (error) {
            console.error("Middleware error:", error);
            if (!res.writableEnded) {
              res.statusCode = 500;
              res.end("Internal Server Error");
            }
          }
        } else {
          next();
        }
      };

      await next();
    });
  }

  use(
    routeOrHandle: string | Connect.NextHandleFunction | Connect.HandleFunction,
    handle?: Connect.NextHandleFunction | Connect.HandleFunction,
  ): Connect.Server {
    let route = "/";
    let handler: Connect.NextHandleFunction;

    if (typeof routeOrHandle === "string") {
      route = routeOrHandle;
      if (!handle) throw new Error("Handler is required when route is provided");
      handler = handle as Connect.NextHandleFunction;
    } else {
      handler = routeOrHandle as Connect.NextHandleFunction;
    }

    this.middlewares.push({ route, handle: handler });
    return this as unknown as Connect.Server;
  }

  listen(...args: any[]): http.Server {
    return this.server.listen(...args);
  }

  async start(options: StandaloneServerOptions = {}): Promise<{ host: string; port: number }> {
    const startPort = options.port || getDefaultPort();
    this.host = options.host ? 'localhost' : "0.0.0.0"
    this.allowedHosts = options.allowedHosts || [];

    // Try to find a free port
    for (let port = startPort; port < startPort + 100; port++) {
      try {
        await new Promise<void>((resolve, reject) => {
          this.server.listen(port, this.host, () => {
            this.port = port;
            resolve();
          });
          this.server.on("error", (err: any) => {
            if (err.code === "EADDRINUSE") {
              this.server.close(); // Ensure closed before retrying
              reject(err);
            } else {
              reject(err);
            }
          });
        });
        // Server started successfully
        return { host: this.host, port: this.port };
      } catch (error: any) {
        if (error.code !== "EADDRINUSE") {
          throw error;
        }
        // Port in use, try next
      }
    }

    throw new Error(`Could not find a free port starting from ${startPort}`);
  }

  close(callback?: (err?: Error) => void) {
    this.server.close(callback);
  }
}

// Global instance to prevent multiple servers in same process if plugin is instantiated multiple times
let globalServer: StandaloneServer | null = null;

export async function startStandaloneServer(options: StandaloneServerOptions = {}) {
  if (globalServer) {
    return {
      server: globalServer,
      host: globalServer.host,
      port: globalServer.port,
      isNew: false,
    };
  }

  globalServer = new StandaloneServer();
  const { host, port } = await globalServer.start(options);

  // Register cleanup hooks once when server starts
  const shutdownHandler = async () => {
    if (globalServer) {
      try {
        await stopStandaloneServer();
      } catch (err) {
        console.error('[dev-inspector] Error during shutdown:', err);
      }
    }
  };

  // Handle graceful shutdown
  process.on('SIGINT', shutdownHandler);
  process.on('SIGTERM', shutdownHandler);

  // Handle process exit
  process.on('exit', () => {
    // Synchronous cleanup on exit
    if (globalServer) {
      globalServer.close();
      globalServer = null;
    }
  });

  return { server: globalServer, host, port, isNew: true };
}

/**
 * Stop and cleanup the global standalone server instance.
 * This should be called when the plugin is shutting down.
 */
export function stopStandaloneServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!globalServer) {
      resolve();
      return;
    }

    const server = globalServer;
    globalServer = null;

    server.close((err) => {
      if (err) {
        console.error('[dev-inspector] Error closing standalone server:', err);
      }
      resolve();
    });
  });
}
