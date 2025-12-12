declare module "virtual:dev-inspector-mcp" {
  /**
   * JSON Schema for tool input parameters
   */
  export interface ToolInputSchema {
    type: "object";
    properties: Record<
      string,
      {
        type: string;
        description?: string;
        enum?: string[];
        default?: unknown;
      }
    >;
    required?: string[];
  }

  /**
   * Custom inspector tool definition
   */
  export interface InspectorTool {
    /** Unique tool name */
    name: string;
    /** Tool description for AI agents */
    description: string;
    /** JSON Schema defining input parameters */
    inputSchema: ToolInputSchema;
    /** Implementation function that executes when the tool is called */
    implementation: (args: Record<string, unknown>) => unknown | Promise<unknown>;
  }

  /**
   * Register a custom tool that can be called by AI agents through MCP.
   *
   * @example
   * ```typescript
   * import { registerInspectorTool } from 'virtual:dev-inspector-mcp';
   *
   * registerInspectorTool({
   *   name: "custom_alert",
   *   description: "Show a custom alert in the browser",
   *   inputSchema: {
   *     type: "object",
   *     properties: {
   *       message: { type: "string", description: "Message to display" }
   *     },
   *     required: ["message"]
   *   },
   *   implementation: (args) => {
   *     alert(args.message as string);
   *     return { success: true };
   *   }
   * });
   * ```
   */
  export function registerInspectorTool(tool: InspectorTool): void;

  /**
   * Development-only inspector initialization module.
   * This module is automatically tree-shaken in production builds.
   */
  const _default: void;
  export default _default;
}
