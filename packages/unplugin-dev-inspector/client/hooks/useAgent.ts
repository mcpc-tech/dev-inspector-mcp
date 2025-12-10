import { useState, useEffect } from "react";
import { getDefaultAgent } from "../utils/config-loader";
import { DEFAULT_AGENT } from "../constants/agents";

export const AGENT_STORAGE_KEY = "AI_SELECTED_AGENT";

export const useAgent = (defaultAgent: string) => {
  const [agent, setAgentState] = useState<string>(defaultAgent);

  useEffect(() => {
    if (typeof window !== "undefined") {
      getDefaultAgent().then((configDefault) => {
        // If config specifies a non-default agent, always use it
        if (configDefault && configDefault !== DEFAULT_AGENT) {
          setAgentState(configDefault);
        } else {
          // No custom config, use localStorage if available
          const saved = localStorage.getItem(AGENT_STORAGE_KEY);
          if (saved) {
            setAgentState(saved);
          }
        }
      });
    }
  }, []);

  const setAgent = (newAgent: string) => {
    setAgentState(newAgent);
    if (typeof window === "undefined") return;

    if (newAgent?.trim()) {
      localStorage.setItem(AGENT_STORAGE_KEY, newAgent);
    } else {
      localStorage.removeItem(AGENT_STORAGE_KEY);
    }
  };

  return { agent, setAgent } as const;
};
