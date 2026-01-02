import { readFileSync, writeFileSync, existsSync } from "fs";
import { installPackage } from "../../utils/package-manager";
import type { SetupOptions, TransformResult } from "./types";
import { detectViteConfig, transformViteConfig } from "./frameworks/vite";
import { detectWebpackConfig, transformWebpackConfig } from "./frameworks/webpack";
import { detectNextConfig, transformNextConfig, transformNextLayout } from "./frameworks/nextjs";
import { resolve } from "path";

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

    const validBundlers = ["vite", "webpack", "nextjs"];

    if (configPath) {
      if (!existsSync(configPath)) {
        console.error(`❌ Provided config file does not exist: ${configPath}`);
        process.exit(1);
      }
      selectedConfigPath = configPath;
      
      // More precise bundler detection using file endings
      const filename = configPath.toLowerCase();
      if (/vite\.config\.(ts|js|mjs)$/i.test(filename)) {
        selectedBundler = "vite";
      } else if (/webpack\.config\.(ts|js|cjs|mjs)$/i.test(filename)) {
        selectedBundler = "webpack";
      } else if (/next\.config\.(ts|js|mjs)$/i.test(filename)) {
        selectedBundler = "nextjs";
      }

      if (!selectedBundler) {
        console.error(`❌ Could not determine bundler type from config path: ${configPath}`);
        console.error(`💡 Use --bundler flag to specify: ${validBundlers.join(", ")}`);
        process.exit(1);
      }
    } else if (bundlerType) {
      // Validate bundler type
      if (!validBundlers.includes(bundlerType)) {
        console.error(`❌ Invalid bundler type: ${bundlerType}`);
        console.error(`💡 Valid options: ${validBundlers.join(", ")}`);
        process.exit(1);
      }
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

    // Handle Next.js layout transformation if entry is provided
    if (selectedBundler === "nextjs" && entryPath) {
      const layoutPath = resolve(cwd, entryPath);
      if (!existsSync(layoutPath)) {
        console.warn(`\n⚠️  Layout file not found: ${layoutPath}`);
        console.warn(`   Skipping layout transformation. Please add <DevInspector /> manually.`);
      } else {
        console.log(`\n🔧 Transforming layout file...`);
        const layoutCode = readFileSync(layoutPath, "utf-8");
        const layoutResult = transformNextLayout(layoutCode);

        if (layoutResult.success && layoutResult.modified) {
          if (!dryRun) {
            writeFileSync(layoutPath, layoutResult.code!, "utf-8");
          }
          console.log(`✅ ${layoutResult.message}`);
        } else if (!layoutResult.success) {
          console.warn(`⚠️  ${layoutResult.message}`);
          if (layoutResult.error) console.warn(`   ${layoutResult.error}`);
        } else {
          console.log(`ℹ️  ${layoutResult.message}`);
        }
      }
    }

    printNextSteps(selectedConfigPath, entryPath, selectedBundler, installed);

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

function printNextSteps(configPath: string, entryPath: string | undefined, bundler: string, installed: boolean) {
  console.log(`\n📝 Next steps:`);
  
  if (!installed) {
    console.log(`   1. Install the package manually: npm install -D @mcpc-tech/unplugin-dev-inspector-mcp`);
    console.log(`   2. Review the changes in ${configPath} and package.json`);
    console.log(`   3. Start your dev server`);
  } else {
    console.log(`   1. Review the changes in ${configPath} and package.json`);
    console.log(`   2. Start your dev server`);
  }

  if (entryPath) {
    console.log(`\n💡 Entry file specified: ${entryPath}`);
    console.log(`   This has been added to your config with autoInject: false`);
    console.log(`   No modifications were made to your entry file`);
  }

  if (bundler === "nextjs") {
    console.log(`\n⚠️  Next.js 16+ uses Turbopack by default`);
    console.log(`   Turbopack mode requires running a standalone MCP server:`);
    console.log(`   `);
    console.log(`   Terminal 1: npm run dev`);
    console.log(`   Terminal 2: npx dev-inspector-server`);
    console.log(`   `);
    console.log(`   Or use concurrently: npx concurrently "npm run dev" "npx dev-inspector-server"`);
    console.log(`   (Webpack mode works without standalone server: npm run dev -- --webpack)`);
  }

  if (bundler === "vite") {
    console.log(`\n⚠️  Important: DevInspector should be placed BEFORE framework plugins (react/vue/svelte)`);
    console.log(`   Please verify the plugin order in your config.`);
  }
}
