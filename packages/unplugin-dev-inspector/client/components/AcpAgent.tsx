import { useState, useRef, useEffect } from "react";
import { useChat } from "@ai-sdk/react";
import { getDevServerBaseUrl } from "../utils/config-loader";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "./ai-elements/conversation";
import { Message, MessageAvatar, MessageContent } from "./ai-elements/message";
import {
  PromptInput,
  PromptInputModelSelect,
  PromptInputModelSelectContent,
  PromptInputModelSelectItem,
  PromptInputModelSelectTrigger,
  PromptInputModelSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from "./ai-elements/prompt-input";
import { Loader } from "./ai-elements/loader";
import { SettingsDialog } from "./settings-dialog";
import { useAgent } from "../hooks/useAgent";
import { useAgentEnv } from "../hooks/useAgentEnv";
import { renderMessagePart } from "../lib/messageRenderer";
import { AVAILABLE_AGENTS, DEFAULT_AGENT } from "../constants/agents";
import type { Agent } from "../constants/agents";
import type { InspectedElement } from "../types";
import { DefaultChatTransport } from "ai";

interface ACPAgentProps {
  sourceInfo?: InspectedElement;
  onClose?: () => void;
}

const ACPAgent = ({ sourceInfo, onClose }: ACPAgentProps = {}) => {
  const [input, setInput] = useState("");
  const { agent: selectedAgent, setAgent: setSelectedAgent } = useAgent(DEFAULT_AGENT);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);

  const currentAgent =
    AVAILABLE_AGENTS.find((agent) => agent.name === selectedAgent) || AVAILABLE_AGENTS[0];
  const requiredKeys = currentAgent.env.filter((e) => e.key && e.required).map((e) => e.key);
  const { envVars, setEnvVar } = useAgentEnv(currentAgent.command, requiredKeys);

  const selectedAgentRef = useRef(selectedAgent);
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    selectedAgentRef.current = selectedAgent;
  }, [selectedAgent]);

  // Initialize session when agent changes or on mount
  useEffect(() => {
    let cancelled = false;

    const initSession = async () => {
      // Clean up previous session if exists
      if (sessionIdRef.current) {
        try {
          await fetch(`${getDevServerBaseUrl()}/api/acp/cleanup-session`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId: sessionIdRef.current }),
          });
        } catch (e) {
          console.warn("[AcpAgent] Failed to cleanup previous session:", e);
        }
      }

      setIsInitializing(true);
      setSessionId(null);
      sessionIdRef.current = null;

      // Prepare env vars
      const preparedEnv: Record<string, string> = {};
      currentAgent.env.forEach((envConfig) => {
        preparedEnv[envConfig.key] = envVars[envConfig.key] ?? "";
      });

      try {
        console.log(`[AcpAgent] Initializing session for ${currentAgent.name}...`);
        const response = await fetch(`${getDevServerBaseUrl()}/api/acp/init-session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agent: currentAgent,
            envVars: preparedEnv,
          }),
        });

        if (!cancelled && response.ok) {
          const data = await response.json();
          console.log(`[AcpAgent] Session initialized: ${data.sessionId}`);
          setSessionId(data.sessionId);
          sessionIdRef.current = data.sessionId;
        }
      } catch (error) {
        console.error("[AcpAgent] Failed to initialize session:", error);
      } finally {
        if (!cancelled) {
          setIsInitializing(false);
        }
      }
    };

    initSession();

    return () => {
      cancelled = true;
    };
  }, [selectedAgent, currentAgent.name]); // Re-init when agent changes

  // Cleanup session on unmount
  useEffect(() => {
    return () => {
      if (sessionIdRef.current) {
        fetch(`${getDevServerBaseUrl()}/api/acp/cleanup-session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: sessionIdRef.current }),
        }).catch(() => {});
      }
    };
  }, []);

  const { messages, sendMessage, status, stop } = useChat({
    transport: new DefaultChatTransport({
      api: `${getDevServerBaseUrl()}/api/acp/chat`,
    }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const missing = requiredKeys.filter((k) => !envVars[k]?.trim());
    if (missing.length) {
      alert(`Please set required keys: ${missing.join(", ")}`);
      return;
    }

    const preparedEnv: Record<string, string> = {};
    currentAgent.env.forEach((envConfig) => {
      preparedEnv[envConfig.key] = envVars[envConfig.key] ?? "";
    });

    sendMessage(
      { text: input },
      {
        body: {
          agent: currentAgent,
          envVars: preparedEnv,
          sessionId: sessionId, // Pass sessionId to use pre-initialized session
        },
      },
    );
    setInput("");
  };

  return (
    <div className="flex flex-col w-full h-full min-h-0">
      <div className="flex-1 overflow-hidden h-[calc(100vh-15rem)] max-h-[calc(100vh-15rem)]">
        <Conversation className="h-full">
          <ConversationContent className="h-full overflow-y-auto p-4 space-y-4">
            {messages.map((message) => (
              <Message
                className="items-start"
                from={message.role as "user" | "assistant"}
                key={message.id}
              >
                <MessageContent>
                  {message.parts.map((part, index) =>
                    renderMessagePart(
                      part,
                      message.id,
                      index,
                      status === "streaming",
                      message.metadata as Record<string, unknown> | undefined,
                    ),
                  )}
                </MessageContent>
                {message.role === "assistant" && (
                  <MessageAvatar name={currentAgent.command} src={currentAgent.meta?.icon ?? ""} />
                )}
              </Message>
            ))}
            {isInitializing && messages.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-4">
                <Loader />
                <span className="text-xs text-muted-foreground animate-pulse">
                  Initializing {currentAgent.name}...
                </span>
              </div>
            )}
            {status === "submitted" && (
              <div className="flex flex-col items-center gap-2 py-4">
                <Loader />
              </div>
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      </div>

      <div className="flex-shrink-0 border-t bg-background pt-4 pb-4">
        <PromptInput onSubmit={handleSubmit}>
          <PromptInputTextarea
            onChange={(e) => setInput(e.target.value)}
            value={input}
            placeholder={
              isInitializing ? `Preparing ${currentAgent.name}...` : "What would you like to know?"
            }
            disabled={isInitializing}
          />
          <PromptInputToolbar>
            <PromptInputTools>
              <PromptInputModelSelect onValueChange={setSelectedAgent} value={selectedAgent}>
                <PromptInputModelSelectTrigger>
                  <PromptInputModelSelectValue />
                </PromptInputModelSelectTrigger>
                <PromptInputModelSelectContent>
                  {AVAILABLE_AGENTS.map((agentOption: Agent) => (
                    <PromptInputModelSelectItem key={agentOption.name} value={agentOption.name}>
                      {agentOption.name}
                    </PromptInputModelSelectItem>
                  ))}
                </PromptInputModelSelectContent>
              </PromptInputModelSelect>
              <SettingsDialog
                selectedAgentName={currentAgent.name}
                requiredKeyNames={requiredKeys}
                values={envVars}
                onChange={(k: string, v: string) => setEnvVar(k, v)}
              />
            </PromptInputTools>
            <PromptInputSubmit
              onAbort={stop}
              disabled={
                isInitializing || !input || requiredKeys.some((k) => !(envVars[k] ?? "").trim())
              }
              status={status}
            />
          </PromptInputToolbar>
        </PromptInput>
      </div>
    </div>
  );
};

export default ACPAgent;
