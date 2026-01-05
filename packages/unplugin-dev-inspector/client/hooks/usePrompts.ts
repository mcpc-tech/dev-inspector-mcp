import { useState, useEffect } from "react";
import type { Client } from "@modelcontextprotocol/sdk/client";

import type { Prompt } from "../constants/types";

import { ListPromptsResultSchema, PromptListChangedNotificationSchema } from "@modelcontextprotocol/sdk/types.js";

export function usePrompts(mcpClient: Client | null) {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let mounted = true;

    const fetchPrompts = async () => {
      if (!mcpClient) {
        if (mounted) setPrompts([]);
        return;
      }

      setIsLoading(true);
      
      try {
        const result = await mcpClient.request(
          { method: "prompts/list" },
          ListPromptsResultSchema
        );
        
        if (mounted && result.prompts) {
          setPrompts(result.prompts as Prompt[]);
        }
      } catch (err) {
        console.error("[usePrompts] Error loading prompts:", err);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    fetchPrompts();

    // Listen for prompt list changes
    if (mcpClient) {
      mcpClient.setNotificationHandler(
        PromptListChangedNotificationSchema,
        async () => {
          console.log("[usePrompts] Received prompts/list_changed notification");
          await fetchPrompts();
        }
      );
    }

    return () => {
      mounted = false;
      // Cleanup notification handler
      try {
        if (mcpClient) {
          mcpClient.removeNotificationHandler("notifications/prompts/list_changed");
        }
      } catch (e) {
        // Ignore errors during cleanup
      }
    };
  }, [mcpClient]);

  return { prompts, isLoading };
}
