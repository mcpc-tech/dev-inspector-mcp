/**
 * DevInspector React - Headless hooks and utilities for building custom inspector UIs
 *
 * @example
 * ```tsx
 * import { useMcp, useAgent, usePrompts } from '@mcpc-tech/unplugin-dev-inspector-mcp/react';
 *
 * function MyCustomInspector() {
 *   const { client, isClientReady } = useMcp();
 *   const { agent, setAgent } = useAgent('Claude Code');
 *   const { prompts } = usePrompts(client);
 *
 *   // Build your custom UI...
 * }
 * ```
 */

// ============================================================================
// Core Hooks
// ============================================================================

export { useMcp, type McpClientType } from "./hooks/useMcp";
export { useAgent } from "./hooks/useAgent";
export { usePrompts } from "./hooks/usePrompts";
export { useContextData, type ContextData } from "./hooks/useContextData";
export { useIslandState } from "./hooks/useIslandState";
export { usePageInfo } from "./hooks/usePageInfo";

// ============================================================================
// Types
// ============================================================================

export type { Agent, Prompt } from "./constants/types";

// ============================================================================
// Utilities
// ============================================================================

export { getDevServerBaseUrl, getAvailableAgents } from "./utils/config-loader";

