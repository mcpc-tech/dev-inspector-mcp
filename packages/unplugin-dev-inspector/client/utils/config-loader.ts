import type { Agent } from "../constants/agents";
import {
  AVAILABLE_AGENTS as DEFAULT_AGENTS,
  DEFAULT_AGENT as DEFAULT_AGENT_NAME,
} from "../constants/agents";

interface InspectorConfig {
  agents?: Agent[];
  defaultAgent?: string;
  showInspectorBar?: boolean;
}

let configCache: InspectorConfig | null = null;
let configPromise: Promise<InspectorConfig> | null = null;

/**
 * Get the dev server base URL from injected config.
 * Uses __DEV_INSPECTOR_CONFIG__ set by the plugin at build time.
 */
export function getDevServerBaseUrl(): string {
  const injectedConfig = (window as any).__DEV_INSPECTOR_CONFIG__ as {
    host: string;
    port: string;
    base: string;
    showInspectorBar?: boolean;
  } | undefined;

  const host = injectedConfig?.host || "localhost";
  const port = injectedConfig?.port || "5173";
  const base = injectedConfig?.base || "/";
  return `http://${host}:${port}${base}`.replace(/\/$/, "");
}

/**
 * Get the showInspectorBar option from injected config.
 */
export function getShowInspectorBar(): boolean {
  const injectedConfig = (window as any).__DEV_INSPECTOR_CONFIG__ as {
    showInspectorBar?: boolean;
  } | undefined;

  return injectedConfig?.showInspectorBar ?? true;
}

/**
 * Merge custom agent with default agent properties
 * If a custom agent has the same name as a default agent, fill in missing properties
 */
function mergeAgentWithDefaults(customAgent: Agent): Agent {
  const defaultAgent = DEFAULT_AGENTS.find((a) => a.name === customAgent.name);

  if (!defaultAgent) {
    // Custom agent with no default match, return as-is
    return customAgent;
  }

  // Merge: custom agent properties take precedence, but fill in missing ones from default
  return {
    ...defaultAgent,
    ...customAgent,
    meta: customAgent.meta || defaultAgent.meta,
    env: customAgent.env || defaultAgent.env,
  };
}

/**
 * Load configuration from the server
 */
async function loadConfig(): Promise<InspectorConfig> {
  if (configCache) {
    return configCache;
  }

  if (configPromise) {
    return configPromise;
  }

  const baseUrl = getDevServerBaseUrl();

  configPromise = fetch(`${baseUrl}/__inspector__/config.json`)
    .then((res) => res.json())
    .then((config: InspectorConfig) => {
      configCache = config;
      return config;
    })
    .catch((err) => {
      console.warn("[Inspector] Failed to load config:", err);
      configCache = {};
      return {};
    })
    .finally(() => {
      configPromise = null;
    });

  return configPromise;
}

/**
 * Get available agents (merged with custom configuration)
 */
export async function getAvailableAgents(): Promise<Agent[]> {
  const config = await loadConfig();

  if (config.agents && config.agents.length > 0) {
    // Merge custom agents with defaults to fill in missing properties (like icons)
    return config.agents.map(mergeAgentWithDefaults);
  }

  // Otherwise return default agents
  return DEFAULT_AGENTS;
}

/**
 * Get the default agent name
 * Falls back to DEFAULT_AGENT_NAME if configured agent doesn't exist
 */
export async function getDefaultAgent(): Promise<string> {
  const config = await loadConfig();
  const name = config.defaultAgent;
  if (name && DEFAULT_AGENTS.some((a) => a.name === name)) {
    return name;
  }
  return DEFAULT_AGENT_NAME;
}

/**
 * Synchronous version - returns defaults immediately
 * Use this for initial render, then update with async version
 */
export function getAvailableAgentsSync(): Agent[] {
  if (configCache?.agents && configCache.agents.length > 0) {
    return configCache.agents.map(mergeAgentWithDefaults);
  }
  return DEFAULT_AGENTS;
}

export function getDefaultAgentSync(): string {
  const name = configCache?.defaultAgent;
  if (name && DEFAULT_AGENTS.some((a) => a.name === name)) {
    return name;
  }
  return DEFAULT_AGENT_NAME;
}
