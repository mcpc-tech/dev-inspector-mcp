import { useEffect, useState } from "react";

export const AGENT_ENV_PREFIX = "AI_AGENT_ENV";

export const useAgentEnv = (agentId?: string, keys?: string[]) => {
  const id = agentId?.trim() || "default";
  const storageKey = (key: string) => `${AGENT_ENV_PREFIX}_${id}_${key}`;

  const [envVars, setEnvVars] = useState<Record<string, string>>({});

  useEffect(() => {
    if (typeof window === "undefined" || !keys?.length) return;

    const initial: Record<string, string> = {};
    keys.forEach((k) => {
      initial[k] = localStorage.getItem(storageKey(k)) ?? "";
    });
    setEnvVars(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, JSON.stringify(keys ?? [])]);

  const setEnvVar = (key: string, value: string) => {
    setEnvVars((prev) => ({ ...prev, [key]: value }));
    if (typeof window === "undefined") return;

    const sk = storageKey(key);
    if (value.trim()) {
      localStorage.setItem(sk, value);
    } else {
      localStorage.removeItem(sk);
    }
  };

  const getEnvVar = (key: string) => envVars[key] ?? "";

  return { envVars, setEnvVar, getEnvVar } as const;
};
