import { useState, useEffect } from "react";
import { getDefaultAgent } from "../utils/config-loader";
import { DEFAULT_AGENT } from "../constants/agents";

export const AGENT_STORAGE_KEY = "AI_SELECTED_AGENT";

export const useAgent = (defaultAgent: string) => {
  const [agent, setAgentState] = useState<string>(() => {
    // Try to initialize from localStorage synchronously to avoid flicker
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(AGENT_STORAGE_KEY);
      if (saved) return saved;
    }
    return defaultAgent;
  });
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      getDefaultAgent()
        .then((configDefault) => {
          // If config specifies a non-default agent, always use it
          // This overrides localStorage if they differ, which is intended for enforcement
          if (configDefault && configDefault !== DEFAULT_AGENT) {
            setAgentState(configDefault);
          }
        })
        .finally(() => {
          setIsReady(true);
        });
    } else {
      setIsReady(true);
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

  return { agent, setAgent, isReady } as const;
};
