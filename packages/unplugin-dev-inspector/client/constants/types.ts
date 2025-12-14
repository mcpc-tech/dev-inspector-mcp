/**
 * ACP (Agent Client Protocol) options for configuring agent behavior
 */
export interface AcpOptions {
  /**
   * ACP provider mode
   * @default undefined (skipped if not specified)
   */
  acpMode?: string;

  /**
   * ACP provider model
   * @default undefined (skipped if not specified)
   */
  acpModel?: string;

  /**
   * Delay in milliseconds after session is initialized to ensure mcp server is ready,
   * some agents may connect mcp asynchronously after session init
   * @default undefined (skipped if not specified)
   */
  acpDelay?: number;

  /**
   * Custom system instructions to prepend to user messages
   * @default undefined (uses built-in DevInspector context)
   */
  acpSystemPrompt?: string;
}

// Agent type definition - shared between src and client
export interface Agent extends AcpOptions {
  name: string;
  command: string;
  args?: string[];
  env: Array<{
    key: string;
    required: boolean;
  }>;
  authMethodId?: string;
  meta?: {
    icon?: string;
  };
  /**
   * Configuration hint text to help users set up the agent
   */
  configHint?: string;
  /**
   * Link to configuration documentation or setup guide
   */
  configLink?: string;
  /**
   * Installation command for the agent (shown in error messages)
   */
  installCommand?: string;
  /**
   * NPM package name for agents that use npm packages (for faster loading via require.resolve)
   */
  npmPackage?: string;
  /**
   * Arguments to pass when using npm package resolution (separate from npx args)
   */
  npmArgs?: string[];
}
