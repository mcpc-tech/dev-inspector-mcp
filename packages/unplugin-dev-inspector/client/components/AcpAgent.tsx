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

  const currentAgent =
    AVAILABLE_AGENTS.find((agent) => agent.name === selectedAgent) || AVAILABLE_AGENTS[0];
  const requiredKeys = currentAgent.env.filter((e) => e.key && e.required).map((e) => e.key);
  const { envVars, setEnvVar } = useAgentEnv(currentAgent.command, requiredKeys);

  const selectedAgentRef = useRef(selectedAgent);

  useEffect(() => {
    selectedAgentRef.current = selectedAgent;
  }, [selectedAgent]);

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
            {status === "submitted" && (
              <div className="flex flex-col items-center gap-2 py-4">
                <Loader />
                {currentAgent.command === "npx" && (
                  <span className="text-xs text-muted-foreground animate-pulse">
                    Starting {currentAgent.name}... This may take a moment on first run.
                  </span>
                )}
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
            placeholder="What would you like to know?"
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
              disabled={!input || requiredKeys.some((k) => !(envVars[k] ?? "").trim())}
              status={status}
            />
          </PromptInputToolbar>
        </PromptInput>
      </div>
    </div>
  );
};

export default ACPAgent;
