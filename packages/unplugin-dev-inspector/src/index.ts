// Main entry point for the unplugin
import { unplugin } from "./core";
import { unpluginExternal } from "./core-external";

export { unplugin as default };
export const external = unpluginExternal;
export { unplugin, unpluginExternal };

export type { DevInspectorOptions } from "./core";
export type { McpConfigOptions, CustomEditorConfig, EditorId } from "./utils/config-updater";

export { turbopackDevInspector, type TurbopackDevInspectorOptions } from "./turbopack";

// Declare virtual module so TypeScript recognizes it (no user config needed)
declare module "virtual:dev-inspector-mcp" {}
