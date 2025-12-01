import type { Agent } from "../constants/agents";
import {
  AVAILABLE_AGENTS as DEFAULT_AGENTS,
  DEFAULT_AGENT as DEFAULT_AGENT_NAME,
} from "../constants/agents";

interface InspectorConfig {
  agents?: Agent[];
  defaultAgent?: string;
}

let configCache: InspectorConfig | null = null;
let configPromise: Promise<InspectorConfig> | null = null;

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

  // Use absolute URL based on the dev server origin/host/port, so this
  // still works when the app itself is accessed via a proxy or different
  // domain. We use window.location values as the primary source since
  // Vite injects the correct host/port at build time into the HTML.
  const host = window.location.hostname || "localhost";
  const port = window.location.port || "5173";
  const base = (window as any).__vite_base__ || "/";
  const origin = window.location.origin || `http://${host}:${port}`;
  const baseUrl = (origin + base).replace(/\/$/, "");

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
 */
export async function getDefaultAgent(): Promise<string> {
  const config = await loadConfig();

  if (config.defaultAgent) {
    return config.defaultAgent;
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
  return configCache?.defaultAgent || DEFAULT_AGENT_NAME;
}
