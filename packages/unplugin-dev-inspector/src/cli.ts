#!/usr/bin/env node

/**
 * CLI for dev-inspector
 *
 * Commands:
 *   setup - Add DevInspector to your bundler config
 *   server - Start standalone MCP server (default)
 */

import { startStandaloneServer } from "./utils/standalone-server";
import { setupMcpMiddleware } from "./middleware/mcproute-middleware";
import { setupInspectorMiddleware } from "./middleware/inspector-middleware";
import { setupAcpMiddleware } from "./middleware/acp-middleware";
import { updateMcpConfigs } from "./utils/config-updater";
import { isEnvTruthy, getPublicBaseUrl } from "./utils/helpers";
import {
  detectConfigs,
  detectConfig,
  detectConfigByPath,
  type BundlerType,
} from "./utils/config-detector";
import { transformConfig } from "./utils/codemod-transformer";
import { writeFileSync, copyFileSync } from "fs";
import type { Connect } from "vite";

async function runSetupCommand() {
  const args = process.argv.slice(3); // Skip 'node', 'cli.js', 'setup'

  let dryRun = false;
  let noBackup = false;
  let configPath: string | undefined;
  let bundlerType: BundlerType | undefined;

  // Parse flags
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") {
      dryRun = true;
    } else if (args[i] === "--no-backup") {
      noBackup = true;
    } else if (args[i] === "--config" && args[i + 1]) {
      configPath = args[i + 1];
      i++;
    } else if (args[i] === "--bundler" && args[i + 1]) {
      bundlerType = args[i + 1] as BundlerType;
      i++;
    } else if (args[i] === "--help" || args[i] === "-h") {
      console.log(`
╔══════════════════════════════════════════════════════════╗
║           🔧 DevInspector Setup Command                  ║
╠══════════════════════════════════════════════════════════╣
║                                                          ║
║  Automatically add DevInspector to your bundler config   ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝

Usage:
  npx @mcpc-tech/unplugin-dev-inspector-mcp setup [options]

Options:
  --config <path>         Specify config file path (auto-detect by default)
  --bundler <type>        Specify bundler type: vite, webpack, nextjs
  --dry-run               Preview changes without applying them
  --no-backup             Skip creating backup files
  --help, -h              Show this help message

Examples:
  # Auto-detect and setup
  npx @mcpc-tech/unplugin-dev-inspector-mcp setup

  # Preview changes without applying
  npx @mcpc-tech/unplugin-dev-inspector-mcp setup --dry-run

  # Setup specific config
  npx @mcpc-tech/unplugin-dev-inspector-mcp setup --config vite.config.ts

  # Setup for specific bundler
  npx @mcpc-tech/unplugin-dev-inspector-mcp setup --bundler vite
`);
      process.exit(0);
    }
  }

  console.log(`
╔══════════════════════════════════════════════════════════╗
║           🔧 DevInspector Setup                          ║
╚══════════════════════════════════════════════════════════╝
`);

  try {
    let targetConfig;

    // Detect config file
    if (configPath) {
      targetConfig = detectConfigByPath(configPath);
      if (!targetConfig) {
        console.error(`❌ Config file not found: ${configPath}`);
        process.exit(1);
      }
    } else if (bundlerType) {
      targetConfig = detectConfig(bundlerType);
      if (!targetConfig) {
        console.error(`❌ No ${bundlerType} config file found in current directory`);
        process.exit(1);
      }
    } else {
      const detected = detectConfigs();
      if (detected.length === 0) {
        console.error("❌ No bundler config files found in current directory");
        console.log(
          "\nSupported configs: vite.config.{ts,js,mjs}, webpack.config.{ts,js}, next.config.{ts,js,mjs}",
        );
        process.exit(1);
      }

      if (detected.length > 1) {
        console.log("📦 Multiple configs detected:");
        detected.forEach((config, i) => {
          console.log(`  ${i + 1}. ${config.bundler}: ${config.path}`);
        });
        console.log("\n💡 Tip: Use --bundler or --config to specify which one to transform");
        targetConfig = detected[0];
        console.log(`\n🎯 Using: ${targetConfig.bundler} (${targetConfig.path})`);
      } else {
        targetConfig = detected[0];
        console.log(`🎯 Detected: ${targetConfig.bundler} config at ${targetConfig.path}`);
      }
    }

    // Transform config
    console.log(
      `\n${dryRun ? "🔍 Previewing" : "🔧 Transforming"} ${targetConfig.bundler} config...`,
    );

    const result = transformConfig({
      configPath: targetConfig.path,
      bundler: targetConfig.bundler,
      dryRun,
    });

    if (!result.success) {
      console.error(`\n❌ ${result.message}`);
      if (result.error) {
        console.error(`   Error: ${result.error}`);
      }
      process.exit(1);
    }

    if (!result.modified) {
      console.log(`\n✅ ${result.message}`);
      process.exit(0);
    }

    if (dryRun) {
      console.log("\n📄 Preview of changes:");
      console.log("─".repeat(60));
      console.log(result.code);
      console.log("─".repeat(60));
      console.log("\n💡 Run without --dry-run to apply these changes");
      process.exit(0);
    }

    // Create backup
    if (!noBackup) {
      const backupPath = `${targetConfig.path}.bak`;
      copyFileSync(targetConfig.path, backupPath);
      console.log(`📦 Backup created: ${backupPath}`);
    }

    // Write transformed code
    writeFileSync(targetConfig.path, result.code!, "utf-8");

    console.log(`\n✅ ${result.message}`);
    console.log(`\n📝 Next steps:`);
    console.log(`   1. Review the changes in ${targetConfig.path}`);
    console.log(`   2. Install the package: npm i -D @mcpc-tech/unplugin-dev-inspector-mcp`);
    console.log(`   3. Start your dev server`);

    if (targetConfig.bundler === "vite") {
      console.log(
        `\n⚠️  Important: DevInspector should be placed BEFORE framework plugins (react/vue/svelte)`,
      );
      console.log(`   Please verify the plugin order in your config.`);
    }
  } catch (error) {
    console.error("❌ Setup failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

async function runServerCommand() {
  const args = process.argv.slice(2);

  // Parse CLI arguments
  let port = 8888;
  let host = "localhost";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--port" && args[i + 1]) {
      port = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--host" && args[i + 1]) {
      host = args[i + 1];
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
  --help, -h        Show this help message

Example:
  npx dev-inspector-server --port 3001
`);
      process.exit(0);
    }
  }

  try {
    const {
      server,
      host: actualHost,
      port: actualPort,
    } = await startStandaloneServer({ port, host });

    const serverContext = {
      host: actualHost,
      port: actualPort,
      disableChrome: isEnvTruthy(process.env.DEV_INSPECTOR_DISABLE_CHROME),
    };
    const displayHost = actualHost === "0.0.0.0" ? "localhost" : actualHost;
    const publicBase = getPublicBaseUrl({
      publicBaseUrl: process.env.DEV_INSPECTOR_PUBLIC_BASE_URL,
      host: displayHost,
      port: actualPort
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

    // Keep process alive
    process.on("SIGINT", () => {
      console.log("\n👋 Shutting down dev-inspector server...");
      process.exit(0);
    });
  } catch (error) {
    console.error("Failed to start dev-inspector server:", error);
    process.exit(1);
  }
}

// Main entry point
async function main() {
  const command = process.argv[2];

  if (command === "setup") {
    await runSetupCommand();
  } else if (command === "server" || !command) {
    await runServerCommand();
  } else {
    console.log(`
Unknown command: ${command}

Available commands:
  setup   - Add DevInspector to your bundler config
  server  - Start standalone MCP server (default)

Run with --help for more information:
  npx @mcpc-tech/unplugin-dev-inspector-mcp setup --help
  npx dev-inspector-server --help
`);
    process.exit(1);
  }
}

main();
