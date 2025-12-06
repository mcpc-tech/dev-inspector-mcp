import http from 'node:http';
import type { Connect } from 'vite';

export interface StandaloneServerOptions {
    port?: number;
    host?: string;
}

// Basic Connect-compatible server implementation
export class StandaloneServer {
    private server: http.Server;
    private middlewares: { route: string; handle: Connect.NextHandleFunction }[] = [];
    public port: number = 0;
    public host: string = 'localhost';
    public stack: any[] = []; // Connect.Server property partial implementation

    constructor() {
        this.server = http.createServer(async (req, res) => {
            // Basic middleware runner
            let index = 0;
            const next = async () => {
                if (index >= this.middlewares.length) {
                    if (!res.writableEnded) {
                        res.statusCode = 404;
                        res.end('Not Found');
                    }
                    return;
                }

                const layer = this.middlewares[index++];
                const url = req.url || '/';

                if (url.startsWith(layer.route)) {
                    try {
                        const originalUrl = req.url;
                        // Strip route prefix if needed for nested apps (simplistic)
                        if (layer.route !== '/' && req.url) {
                            // req.url = req.url.slice(layer.route.length) || '/';
                        }

                        await layer.handle(req, res, next);

                        if (layer.route !== '/') {
                            req.url = originalUrl;
                        }
                    } catch (error) {
                        console.error('Middleware error:', error);
                        if (!res.writableEnded) {
                            res.statusCode = 500;
                            res.end('Internal Server Error');
                        }
                    }
                } else {
                    next();
                }
            };

            await next();
        });
    }

    use(routeOrHandle: string | Connect.NextHandleFunction | Connect.HandleFunction, handle?: Connect.NextHandleFunction | Connect.HandleFunction): Connect.Server {
        let route = '/';
        let handler: Connect.NextHandleFunction;

        if (typeof routeOrHandle === 'string') {
            route = routeOrHandle;
            if (!handle) throw new Error('Handler is required when route is provided');
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
        const startPort = options.port || 8888;
        this.host = options.host || 'localhost';

        // Try to find a free port
        for (let port = startPort; port < startPort + 100; port++) {
            try {
                await new Promise<void>((resolve, reject) => {
                    this.server.listen(port, this.host, () => {
                        this.port = port;
                        resolve();
                    });
                    this.server.on('error', (err: any) => {
                        if (err.code === 'EADDRINUSE') {
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
                if (error.code !== 'EADDRINUSE') {
                    throw error;
                }
                // Port in use, try next
            }
        }

        throw new Error(`Could not find a free port starting from ${startPort}`);
    }

    close() {
        this.server.close();
    }
}

// Global instance to prevent multiple servers in same process if plugin is instantiated multiple times
let globalServer: StandaloneServer | null = null;

export async function startStandaloneServer(options: StandaloneServerOptions = {}) {
    if (globalServer) {
        return { server: globalServer, host: globalServer.host, port: globalServer.port };
    }

    globalServer = new StandaloneServer();
    const { host, port } = await globalServer.start(options);
    return { server: globalServer, host, port };
}
