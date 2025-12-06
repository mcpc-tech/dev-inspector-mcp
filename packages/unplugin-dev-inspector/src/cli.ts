#!/usr/bin/env node

/**
 * Standalone dev-inspector server for Turbopack/other non-webpack builds
 * 
 * Usage:
 *   npx dev-inspector-server
 *   npx dev-inspector-server --port 8888 --host localhost
 */

import { startStandaloneServer } from './utils/standalone-server';
import { setupMcpMiddleware } from './middleware/mcproute-middleware';
import { setupInspectorMiddleware } from './middleware/inspector-middleware';
import { setupAcpMiddleware } from './middleware/acp-middleware';
import { updateMcpConfigs } from './utils/config-updater';
import type { Connect } from 'vite';

async function main() {
    const args = process.argv.slice(2);

    // Parse CLI arguments
    let port = 8888;
    let host = 'localhost';

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--port' && args[i + 1]) {
            port = parseInt(args[i + 1], 10);
            i++;
        } else if (args[i] === '--host' && args[i + 1]) {
            host = args[i + 1];
            i++;
        } else if (args[i] === '--help' || args[i] === '-h') {
            console.log(`
dev-inspector-server - Standalone MCP server for dev-inspector

Usage:
  npx dev-inspector-server [options]

Options:
  --port <number>   Port to run the server on (default: 8888)
  --host <string>   Host to bind to (default: localhost)
  --help, -h        Show this help message

Example:
  npx dev-inspector-server --port 3001
`);
            process.exit(0);
        }
    }

    try {
        const { server, host: actualHost, port: actualPort } = await startStandaloneServer({ port, host });

        const serverContext = { host: actualHost, port: actualPort };
        const displayHost = actualHost === '0.0.0.0' ? 'localhost' : actualHost;
        const baseUrl = `http://${displayHost}:${actualPort}/__mcp__/sse`;

        console.log(`
╔══════════════════════════════════════════════════════════╗
║              🔍 Dev Inspector MCP Server                 ║
╠══════════════════════════════════════════════════════════╣
║                                                          ║
║  MCP Endpoint: ${baseUrl.padEnd(40)}║
║                                                          ║
║  Use this in your editor's MCP config or with           ║
║  the DevInspector React component.                       ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
`);

        // Setup middlewares
        setupMcpMiddleware(server as unknown as Connect.Server, serverContext);
        setupAcpMiddleware(server as unknown as Connect.Server, serverContext, {});
        setupInspectorMiddleware(server as unknown as Connect.Server, {});

        // Auto-update MCP configs
        const root = process.cwd();
        await updateMcpConfigs(root, baseUrl, {});

        // Keep process alive
        process.on('SIGINT', () => {
            console.log('\n👋 Shutting down dev-inspector server...');
            process.exit(0);
        });

    } catch (error) {
        console.error('Failed to start dev-inspector server:', error);
        process.exit(1);
    }
}

main();
