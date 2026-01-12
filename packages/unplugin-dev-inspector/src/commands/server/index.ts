import { startStandaloneServer } from "../../utils/standalone-server";
import { setupMcpMiddleware } from "../../middleware/mcproute-middleware";
import { setupInspectorMiddleware } from "../../middleware/inspector-middleware";
import { setupAcpMiddleware } from "../../middleware/acp-middleware";
import { updateMcpConfigs } from "../../utils/config-updater";
import { getPublicBaseUrl, isEnvTruthy } from "../../utils/helpers";
import type { Connect } from "vite";

export async function runServerCommand() {
  const args = process.argv.slice(3); // Skip 'node', 'cli.js', 'server'

  // Parse CLI arguments
  let port = 8888;
  let host = "localhost";
  const allowedHosts: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--port" && args[i + 1]) {
      port = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--host" && args[i + 1]) {
      host = args[i + 1];
      i++;
    } else if (args[i] === "--allowed-hosts" && args[i + 1]) {
      // Split by comma
      const hosts = args[i + 1].split(',').map(h => h.trim()).filter(Boolean);
      allowedHosts.push(...hosts);
      i++;
    } else if (args[i] === "--help" || args[i] === "-h") {
      console.log(`
╔══════════════════════════════════════════════════════════╗
║           🔍 DevInspector MCP Server                     ║
╠══════════════════════════════════════════════════════════╣
║                                                          ║
║  Standalone MCP server for dev-inspector                 ║
║  (for Turbopack and other non-webpack builds)            ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝

Usage:
  npx dev-inspector-server [options]

Options:
  --port <number>   Port to run the server on (default: 8888)
  --host <string>   Host to bind to (default: localhost)
  --allowed-hosts <string>  Comma-separated list of allowed hosts (e.g. "example.com,.my-ide.com")
  --help, -h        Show this help message

Example:
  npx dev-inspector-server --port 3001 --host 0.0.0.0 --allowed-hosts my-ide.example.com
`);
      process.exit(0);
    }
  }

  try {
    const {
      server,
      host: actualHost,
      port: actualPort,
    } = await startStandaloneServer({ port, host, allowedHosts });

    const serverContext = {
      host: actualHost,
      port: actualPort,
      disableChrome: isEnvTruthy(process.env.DEV_INSPECTOR_DISABLE_CHROME),
    };
    const displayHost = actualHost === "0.0.0.0" ? "localhost" : actualHost;
    const publicBase = getPublicBaseUrl({
      publicBaseUrl: process.env.DEV_INSPECTOR_PUBLIC_BASE_URL,
      host: displayHost,
      port: actualPort,
    });
    const baseUrl = `${publicBase}/__mcp__/sse`;

    console.log(`[dev-inspector] 📡 MCP (Standalone): ${baseUrl}\n`);

    // Setup middlewares
    setupMcpMiddleware(server as unknown as Connect.Server, serverContext);
    setupAcpMiddleware(server as unknown as Connect.Server, serverContext, {});
    setupInspectorMiddleware(server as unknown as Connect.Server, {});

    // Auto-update MCP configs
    const root = process.cwd();
    await updateMcpConfigs(root, baseUrl, {});

    // Shutdown is handled by unified shutdown-manager
  } catch (error) {
    console.error("Failed to start dev-inspector server:", error);
    process.exit(1);
  }
}
