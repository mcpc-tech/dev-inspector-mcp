import { existsSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

export type PackageManager = "npm" | "yarn" | "pnpm" | "bun";

import { dirname } from "path";

export function detectPackageManager(
    cwd: string = process.cwd(),
): PackageManager {
    let current = cwd;
    const root = dirname(cwd) === cwd ? cwd : "/";

    // Recursively check for lockfiles up to the root
    while (current !== root) {
        if (existsSync(join(current, "pnpm-lock.yaml"))) return "pnpm";
        if (existsSync(join(current, "yarn.lock"))) return "yarn";
        if (existsSync(join(current, "bun.lockb"))) return "bun";
        if (existsSync(join(current, "package-lock.json"))) return "npm";

        const parent = dirname(current);
        if (parent === current) break;
        current = parent;
    }

    // Default to npm if no lock file found, or check user agent if running via npx/npm script
    const userAgent = process.env.npm_config_user_agent;
    if (userAgent) {
        if (userAgent.startsWith("pnpm")) return "pnpm";
        if (userAgent.startsWith("yarn")) return "yarn";
        if (userAgent.startsWith("bun")) return "bun";
    }

    return "npm";
}

export function getInstallCommand(
    pm: PackageManager,
    packageName: string,
    dev: boolean = true,
): string {
    const flags = dev ? "-D" : "";
    switch (pm) {
        case "npm":
            return `npm install ${flags} ${packageName}`;
        case "yarn":
            return `yarn add ${flags} ${packageName}`;
        case "pnpm":
            return `pnpm add ${flags} ${packageName}`;
        case "bun":
            return `bun add ${flags} ${packageName}`;
        default:
            return `npm install ${flags} ${packageName}`;
    }
}

export function installPackage(
    packageName: string,
    dev: boolean = true,
): boolean {
    const pm = detectPackageManager();
    const command = getInstallCommand(pm, packageName, dev);

    console.log(`\n📦 Installing ${packageName} with ${pm}...`);
    console.log(`   Running: ${command}`);

    try {
        execSync(command, { stdio: "inherit" });
        console.log(`✅ Successfully installed ${packageName}`);
        return true;
    } catch (error) {
        console.error(`❌ Failed to install ${packageName}`);
        return false;
    }
}
