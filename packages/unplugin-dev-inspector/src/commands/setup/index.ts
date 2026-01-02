import { readFileSync, writeFileSync, existsSync } from "fs";
import { installPackage } from "../../utils/package-manager";
import type { SetupOptions, TransformResult } from "./types";
import { detectViteConfig, transformViteConfig } from "./frameworks/vite";
import { detectWebpackConfig, transformWebpackConfig } from "./frameworks/webpack";
import { detectNextConfig, transformNextConfig } from "./frameworks/nextjs";

export async function runSetupCommand() {
  const args = process.argv.slice(3); // Skip 'node', 'cli.js', 'setup'

  let dryRun = false;
  let configPath: string | undefined;
  let bundlerType: string | undefined;
  let entryPath: string | undefined;

  // Parse flags
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") {
      dryRun = true;
    } else if (args[i] === "--config" && args[i + 1]) {
      configPath = args[i + 1];
      i++;
    } else if (args[i] === "--entry" && args[i + 1]) {
      entryPath = args[i + 1];
      i++;
    } else if (args[i] === "--bundler" && args[i + 1]) {
      bundlerType = args[i + 1];
      i++;
    } else if (args[i] === "--help" || args[i] === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  console.log(`
╔══════════════════════════════════════════════════════════╗
║           🔧 DevInspector Setup                          ║
╚══════════════════════════════════════════════════════════╝
`);

  try {
    const cwd = process.cwd();
    let selectedConfigPath: string | null = null;
    let selectedBundler: string | null = null;
    const frameworks = [
      { type: "vite", detect: detectViteConfig, transform: transformViteConfig },
      { type: "webpack", detect: detectWebpackConfig, transform: transformWebpackConfig },
      { type: "nextjs", detect: detectNextConfig, transform: transformNextConfig },
    ];

    if (configPath) {
      if (!existsSync(configPath)) {
        console.error(`❌ Provided config file does not exist: ${configPath}`);
        process.exit(1);
      }
      selectedConfigPath = configPath;
      if (configPath.includes("vite")) selectedBundler = "vite";
      else if (configPath.includes("webpack")) selectedBundler = "webpack";
      else if (configPath.includes("next")) selectedBundler = "nextjs";
    } else if (bundlerType) {
      selectedBundler = bundlerType;
      const fw = frameworks.find(f => f.type === bundlerType);
      if (fw) selectedConfigPath = fw.detect(cwd);
    } else {
      const detected = frameworks
        .map(f => ({ type: f.type, path: f.detect(cwd) }))
        .filter(d => d.path !== null) as { type: string, path: string }[];

      if (detected.length === 0) {
        console.error("❌ No bundler config files found in current directory");
        process.exit(1);
      }

      if (detected.length > 1) {
        console.log("📦 Multiple configs detected:");
        detected.forEach((d, i) => console.log(`  ${i + 1}. ${d.type}: ${d.path}`));
        console.log("\n💡 Tip: Use --bundler or --config to specify which one to transform");
      }

      selectedBundler = detected[0].type;
      selectedConfigPath = detected[0].path;
      console.log(`🎯 Using: ${selectedBundler} (${selectedConfigPath})`);
    }

    if (!selectedConfigPath || !selectedBundler) {
      console.error(`❌ Could not find or detect ${bundlerType || "any"} configuration`);
      process.exit(1);
    }

    // Transform
    console.log(`\n${dryRun ? "🔍 Previewing" : "🔧 Transforming"} ${selectedBundler} config...`);
    const code = readFileSync(selectedConfigPath, "utf-8");
    const options: SetupOptions = { dryRun, configPath: selectedConfigPath, entryPath };
    
    const framework = frameworks.find(f => f.type === selectedBundler);
    if (!framework) {
      console.error(`❌ Unsupported bundler: ${selectedBundler}`);
      process.exit(1);
    }
    
    const result = framework.transform(code, options);

    if (!result.success) {
      console.error(`\n❌ ${result.message}`);
      if (result.error) console.error(`   Error: ${result.error}`);
      process.exit(1);
    }

    if (dryRun) {
      showPreview(result);
      process.exit(0);
    }

    // Execution
    const installed = installPackage("@mcpc-tech/unplugin-dev-inspector-mcp", true);
    if (!installed) {
      console.warn("⚠️  Package installation failed, but setup will continue with config transformation.");
    }

    if (result.modified) {
      writeFileSync(selectedConfigPath, result.code!, "utf-8");
      console.log(`\n✅ ${result.message}`);
    } else {
      console.log(`\n✅ ${result.message}`);
    }

    printNextSteps(selectedConfigPath, entryPath, selectedBundler);

  } catch (error) {
    console.error("❌ Setup failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

function printHelp() {
  console.log(`
Usage:
  npx @mcpc-tech/unplugin-dev-inspector-mcp setup [options]

Options:
  --config <path>         Specify config file path (auto-detect by default)
  --entry <path>          Specify entry file path to add import (optional)
  --bundler <type>        Specify bundler type: vite, webpack, nextjs
  --dry-run               Preview changes without applying them
  --help, -h              Show this help message
`);
}

function showPreview(result: TransformResult) {
  if (result.modified) {
    console.log("\n📄 Preview of config changes:");
    console.log("─".repeat(60));
    console.log(result.code);
    console.log("─".repeat(60));
  } else {
    console.log(`\n✅ Config: ${result.message}`);
  }

  console.log("\n💡 Run without --dry-run to apply these changes");
}

function printNextSteps(configPath: string, entryPath: string | undefined, bundler: string) {
  console.log(`\n📝 Next steps:`);
  console.log(`   1. Review the changes in ${configPath}${entryPath ? ` and ${entryPath}` : ""} and package.json`);
  console.log(`   2. Start your dev server`);

  if (bundler === "vite") {
    console.log(`\n⚠️  Important: DevInspector should be placed BEFORE framework plugins (react/vue/svelte)`);
    console.log(`   Please verify the plugin order in your config.`);
  }
}
