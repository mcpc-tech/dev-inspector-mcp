#!/usr/bin/env node

/**
 * CLI for dev-inspector
 *
 * Commands:
 *   setup - Add DevInspector to your bundler config
 *   server - Start standalone MCP server (default)
 */

import { runSetupCommand } from "./commands/setup";
import { runServerCommand } from "./commands/server";

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
