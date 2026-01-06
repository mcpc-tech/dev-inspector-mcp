import type { Agent, Prompt } from "../constants/types";
import {
  AVAILABLE_AGENTS as DEFAULT_AGENTS,
  DEFAULT_AGENT as DEFAULT_AGENT_NAME,
} from "../constants/agents";

interface InspectorConfig {
  agents?: Agent[];
  prompts?: Prompt[];
  visibleAgents?: string[];
  defaultAgent?: string;
  showInspectorBar?: boolean;
  defaultPrompts?: boolean | string[];
}

let configCache: InspectorConfig | null = null;
let configPromise: Promise<InspectorConfig> | null = null;

/**
 * Get the dev server base URL from injected config.
 * Uses __DEV_INSPECTOR_CONFIG__ set by the plugin at build time.
 * Falls back to window.location.origin for sidebar pages.
 */
export function getDevServerBaseUrl(): string {
  const injectedConfig = (window as any).__DEV_INSPECTOR_CONFIG__ as
    | {
        host: string;
        port: string;
        base: string;
        baseUrl?: string;
        showInspectorBar?: boolean;
      }
    | undefined;

  const base = injectedConfig?.base || "/";

  // Explicit override (useful when behind proxies or when host/port are not externally reachable)
  if (injectedConfig?.baseUrl && typeof injectedConfig.baseUrl === "string") {
    return injectedConfig.baseUrl.replace(/\/$/, "");
  }

  // If we have host/port from injected config, use those
  if (injectedConfig?.host && injectedConfig?.port) {
    const host = injectedConfig.host;
    const port = injectedConfig.port;
    return `http://${host}:${port}${base}`.replace(/\/$/, "");
  }

  // Fallback: use current page origin (for sidebar and other standalone pages)
  // This ensures the sidebar connects to the same server it's served from
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }

  // Last resort: default dev server port
  return `http://localhost:5137`;
}

/**
 * Get the showInspectorBar option from injected config.
 */
export function getShowInspectorBar(): boolean {
  const injectedConfig = (window as any).__DEV_INSPECTOR_CONFIG__ as
    | {
        showInspectorBar?: boolean;
      }
    | undefined;

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
 * Get available agents (merged with custom configuration and filtered by visibleAgents)
 */
export async function getAvailableAgents(): Promise<Agent[]> {
  const config = await loadConfig();

  let agents: Agent[];

  if (config.agents && config.agents.length > 0) {
    // Merge custom agents with defaults to fill in missing properties (like icons)
    agents = config.agents.map(mergeAgentWithDefaults);
  } else {
    // Otherwise use default agents
    agents = DEFAULT_AGENTS;
  }

  // Filter by visibleAgents if specified
  if (config.visibleAgents && config.visibleAgents.length > 0) {
    agents = agents.filter(agent => config.visibleAgents!.includes(agent.name));
  }

  return agents;
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
  let agents: Agent[];

  if (configCache?.agents && configCache.agents.length > 0) {
    agents = configCache.agents.map(mergeAgentWithDefaults);
  } else {
    agents = DEFAULT_AGENTS;
  }

  // Filter by visibleAgents if specified
  if (configCache?.visibleAgents && configCache.visibleAgents.length > 0) {
    agents = agents.filter(agent => configCache!.visibleAgents!.includes(agent.name));
  }

  return agents;
}

export function getDefaultAgentSync(): string {
  const name = configCache?.defaultAgent;
  if (name && DEFAULT_AGENTS.some((a) => a.name === name)) {
    return name;
  }
  return DEFAULT_AGENT_NAME;
}
