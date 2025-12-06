import React from "react";
import type { UIMessage } from "ai";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "./ai-elements/conversation";
import { Message, MessageAvatar, MessageContent } from "./ai-elements/message";
import { Loader } from "./ai-elements/loader";
import { renderMessagePart } from "../lib/messageRenderer";
import { AVAILABLE_AGENTS, DEFAULT_AGENT } from "../constants/agents";

interface MessageDetailProps {
  messages: UIMessage[];
  status: "streaming" | "submitted" | "ready" | "error";
  selectedAgent?: string;
}

export const MessageDetail: React.FC<MessageDetailProps> = ({
  messages,
  status,
  selectedAgent,
}) => {
  const currentAgent =
    AVAILABLE_AGENTS.find((a) => a.name === (selectedAgent || DEFAULT_AGENT)) ||
    AVAILABLE_AGENTS[0];

  return (
    <Conversation className="w-full h-full">
      <ConversationContent className="p-3 space-y-3">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <p className="text-sm">No messages yet</p>
              <p className="text-xs mt-1">
                Enter a question below to start
              </p>
            </div>
          </div>
        ) : (
          messages.map((message) => (
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
                    message.metadata as Record<string, unknown> | undefined
                  )
                )}
              </MessageContent>
              {message.role === "assistant" && (
                <MessageAvatar
                  name={currentAgent.name}
                  src={currentAgent.meta?.icon ?? ""}
                />
              )}
            </Message>
          ))
        )}
        {status === "submitted" && messages.length === 0 && <Loader />}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
};
