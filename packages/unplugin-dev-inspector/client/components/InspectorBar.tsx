import React, { useState, useRef, useEffect } from "react";
import { cn } from "../lib/utils";
import {
  Eye,
  Sparkles,
  ArrowRight,
  Terminal,
  CheckCircle2,
  XCircle,
  ChevronUp,
  Inbox,
  Square,
} from "lucide-react";

import type { UIMessage } from "ai";
import { processMessage, extractToolName } from "../utils/messageProcessor";
import { InspectionQueue, type InspectionItem } from "./InspectionQueue";
import { MessageDetail } from "./MessageDetail";

import { AVAILABLE_AGENTS, DEFAULT_AGENT } from "../constants/agents";
import { useDraggable } from "../hooks/useDraggable";
import { useAgent } from "../hooks/useAgent";
import { getDevServerBaseUrl } from "../utils/config-loader";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { DynamicIsland } from "./DynamicIsland";
interface InspectorBarProps {
  isActive: boolean;
  onToggleInspector: () => void;
  onSubmitAgent: (query: string, agentName: string, sessionId?: string) => void;
  onCancel?: () => void;
  isAgentWorking: boolean;
  messages: UIMessage[];
  status: "streaming" | "submitted" | "ready" | "error";
  inspectionCount?: number;
  inspectionItems?: InspectionItem[];
  onRemoveInspection?: (id: string) => void;
  toolsReady?: boolean;
}

export const InspectorBar = ({
  isActive,
  onToggleInspector,
  onSubmitAgent,
  onCancel,
  isAgentWorking,
  messages,
  status,
  inspectionCount = 0,
  inspectionItems = [],
  onRemoveInspection = () => { },
  toolsReady = true, // Default to true if not provided (backward compatibility)
}: InspectorBarProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [input, setInput] = useState("");
  const [toolCall, setToolCall] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<"none" | "inspections" | "chat">("none");

  const [isLocked, setIsLocked] = useState(false);
  const [allowHover, setAllowHover] = useState(true);
  const leaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const { agent: selectedAgent, setAgent: setSelectedAgent, isReady } = useAgent(DEFAULT_AGENT);
  const [isAgentSelectorOpen, setIsAgentSelectorOpen] = useState(false);
  const [configInfoAgent, setConfigInfoAgent] = useState<string | null>(null);

  // Session State
  const [sessionId, setSessionId] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const didCleanupSessionRef = useRef(false);

  const cleanupSession = (sid: string) => {
    const url = `${getDevServerBaseUrl()}/api/acp/cleanup-session`;
    const payload = JSON.stringify({ sessionId: sid });

    try {
      if (navigator.sendBeacon) {
        const blob = new Blob([payload], { type: "application/json" });
        navigator.sendBeacon(url, blob);
        return;
      }
    } catch {
      // Ignore and fall back to fetch
    }

    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => { });
  };

  // Init session on mount or agent change
  useEffect(() => {
    // Wait for Config (isReady) AND Client Tools (toolsReady)
    if (!isReady || !toolsReady) return;

    let mounted = true;
    const currentAgent =
      AVAILABLE_AGENTS.find((a) => a.name === selectedAgent) || AVAILABLE_AGENTS[0];

    const initSession = async () => {
      // Cleanup previous session if existence
      if (sessionIdRef.current) {
        try {
          await fetch(`${getDevServerBaseUrl()}/api/acp/cleanup-session`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId: sessionIdRef.current }),
          });
        } catch (e) {
          console.warn("[InspectorBar] Failed to cleanup previous session:", e);
        }
        sessionIdRef.current = null;
        if (mounted) setSessionId(null);
      }

      console.log(`[InspectorBar] Initializing session for ${currentAgent.name}...`);

      try {
        const response = await fetch(`${getDevServerBaseUrl()}/api/acp/init-session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agent: currentAgent,
            envVars: {}, // TODO: Add env var support if needed in InspectorBar
          }),
        });

        if (!response.ok) throw new Error("Failed to init session");

        const data = await response.json();
        if (mounted && data.sessionId) {
          console.log(`[InspectorBar] Session initialized: ${data.sessionId}`);
          setSessionId(data.sessionId);
          sessionIdRef.current = data.sessionId;
          didCleanupSessionRef.current = false;
        }
      } catch (error) {
        console.error("[InspectorBar] Failed to initialize session:", error);
      }
    };

    initSession();

    return () => {
      mounted = false;
    };
  }, [selectedAgent, isReady, toolsReady]);

  // Cleanup on refresh/close (best-effort)
  useEffect(() => {
    const onPageHide = () => {
      const sid = sessionIdRef.current;
      if (!sid || didCleanupSessionRef.current) return;
      didCleanupSessionRef.current = true;
      cleanupSession(sid);
    };

    window.addEventListener("pagehide", onPageHide);

    return () => {
      window.removeEventListener("pagehide", onPageHide);
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const sid = sessionIdRef.current;
      if (!sid || didCleanupSessionRef.current) return;
      didCleanupSessionRef.current = true;
      console.log(`[InspectorBar] Cleaning up session on unmount: ${sid}`);
      cleanupSession(sid);
    };
  }, []);



  // Use custom draggable hook
  const { elementRef: containerRef, isDragging, handleMouseDown } = useDraggable();

  // Inspection status display
  const [inspectionStatus, setInspectionStatus] = useState<{
    id: string;
    status: "in-progress" | "completed" | "failed";
    message?: string;
    currentStep?: {
      title: string;
      index: number;
      total: number;
    };
  } | null>(null);



  // Refs
  const inputRef = useRef<HTMLInputElement>(null);
  // containerRef is now provided by useDraggable
  const toolClearTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSeenToolNameRef = useRef<string | null>(null);
  const isToolActiveRef = useRef(false);

  // Main effect: Process messages
  useEffect(() => {
    if (messages.length === 0) {
      setToolCall(null);
      lastSeenToolNameRef.current = null;
      isToolActiveRef.current = false;
      return;
    }

    // KISS: Only process the LAST message (the one that's being updated)
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role !== "assistant") return;

    // Extract tool from the last message
    const extractedTool = extractToolName(lastMessage);
    const { toolCall: activeToolCall } = processMessage(
      lastMessage,
      extractedTool || lastSeenToolNameRef.current,
    );

    // Track tool name
    if (extractedTool) {
      lastSeenToolNameRef.current = extractedTool;
    }

    // Update tool display
    if (activeToolCall) {
      // There's an active tool - show it
      if (toolClearTimerRef.current) {
        clearTimeout(toolClearTimerRef.current);
        toolClearTimerRef.current = null;
      }
      setToolCall(activeToolCall);
      isToolActiveRef.current = true;
    } else {
      isToolActiveRef.current = false;
    }
  }, [messages, isAgentWorking]);

  // Effect to clear tool when agent stops working
  useEffect(() => {
    if (!isAgentWorking) {
      setToolCall(null);
    }
  }, [isAgentWorking]);

  // Auto-focus input when expanded
  useEffect(() => {
    if (isExpanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isExpanded]);

  // Unlock immediately when AI finishes working, but delay hover to show result
  useEffect(() => {
    if (!isAgentWorking && isLocked) {
      // Unlock immediately, but keep showing the content

      setIsLocked(false);
      // Don't clear tool call here - let the message processing effect handle it with delay
      // Temporarily disable hover to show result
      setAllowHover(false);
      // Re-enable hover after 2 seconds
      const timer = setTimeout(() => {
        setAllowHover(true);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isAgentWorking, isLocked]);

  // Listen to inspection progress updates
  useEffect(() => {
    function handleInspectionProgress(event: Event) {
      const customEvent = event as CustomEvent;
      const { plan, inspectionId } = customEvent.detail;

      // Find current step being processed
      if (plan?.steps) {
        const inProgressStep = plan.steps.find((s: any) => s.status === "in-progress");
        const completedCount = plan.steps.filter((s: any) => s.status === "completed").length;

        setInspectionStatus({
          id: inspectionId,
          status: "in-progress",
          currentStep: inProgressStep
            ? {
              title: inProgressStep.title,
              index: completedCount + 1,
              total: plan.steps.length,
            }
            : undefined,
        });
      }
    }

    function handleInspectionResult(event: Event) {
      const customEvent = event as CustomEvent;
      const { status, result, inspectionId } = customEvent.detail;

      setInspectionStatus({
        id: inspectionId,
        status: status,
        message: result?.message || result,
      });

      // Keep showing the result - don't auto-clear
    }

    window.addEventListener("plan-progress-reported", handleInspectionProgress as EventListener);
    window.addEventListener("inspection-result-received", handleInspectionResult as EventListener);

    return () => {
      window.removeEventListener(
        "plan-progress-reported",
        handleInspectionProgress as EventListener,
      );
      window.removeEventListener(
        "inspection-result-received",
        handleInspectionResult as EventListener,
      );
    };
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    // Clear any pending timer
    if (toolClearTimerRef.current) {
      clearTimeout(toolClearTimerRef.current);
      toolClearTimerRef.current = null;
    }

    // Clear all states for new query
    setToolCall(null);
    setInspectionStatus(null);
    lastSeenToolNameRef.current = null;

    setIsLocked(true);

    onSubmitAgent(input, selectedAgent, sessionId || undefined);
    setInput("");

    // Auto-expand chat panel to show message detail
    setIsExpanded(true);
    setActivePanel("chat");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
    if (e.key === "Escape") {
      setIsExpanded(false);
      inputRef.current?.blur();
    }
  };

  const isError = status === "error";

  // Derive last message text for collapsed state
  const lastMessage = messages[messages.length - 1];
  const lastMessageText = (lastMessage?.role === "assistant")
    ? processMessage(lastMessage, lastSeenToolNameRef.current).displayText
    : "";


  return (
    <>
      {/* Transparent overlay to prevent pointer events leaking to host page when expanded */}
      {(isExpanded || activePanel !== "none") && (
        <div
          className="fixed inset-0 z-[999998] bg-transparent"
          onClick={() => {
            if (!isLocked && !isAgentWorking) {
              setIsExpanded(false);
              setActivePanel("none");
            }
          }}
        />
      )}

      <DynamicIsland
        isExpanded={isExpanded || activePanel !== "none"}
        isWorking={isAgentWorking}
        status={status === "error" ? "error" : isAgentWorking ? "working" : "idle"}
        dragHandlers={{
          ref: containerRef,
          onMouseDown: handleMouseDown,
          isDragging: isDragging,
        }}
        onMouseEnter={() => {
          if (leaveTimerRef.current) {
            clearTimeout(leaveTimerRef.current);
            leaveTimerRef.current = null;
          }
          if (!isDragging) {
            if (isAgentWorking || isLocked) {
              setIsExpanded(true);
              setActivePanel("chat");
            } else if (allowHover) {
              setIsExpanded(true);
            }
          }
        }}
        onMouseLeave={() => {
          leaveTimerRef.current = setTimeout(() => {
            if (!input.trim() && !isLocked && !isDragging) {
              setIsExpanded(false);
              setActivePanel("none");
            }
            setAllowHover(true);
          }, 300);
        }}

        // 1. Collapsed State: Only status icons and brief text
        collapsedContent={
          <>
            {/* Status Icon */}
            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-accent flex-shrink-0 mr-3">
              {isAgentWorking ? (
                <Sparkles className="w-3.5 h-3.5 animate-pulse text-foreground" />
              ) : (
                AVAILABLE_AGENTS.find((a) => a.name === selectedAgent)?.meta?.icon ? (
                  <img
                    src={AVAILABLE_AGENTS.find((a) => a.name === selectedAgent)?.meta?.icon}
                    alt="Agent"
                    className="w-4 h-4 object-contain"
                  />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-foreground" />
                )
              )}
            </div>

            {/* Status Text (Truncated) */}
            <div className="flex flex-col min-w-0 max-w-[200px] overflow-hidden">
              {toolCall ? (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground/90">
                  <Terminal className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">{toolCall}</span>
                </div>
              ) : (
                <span className="text-xs text-muted-foreground/70 whitespace-nowrap overflow-hidden text-ellipsis">
                  {isAgentWorking ? (lastMessageText || "Thinking...") : "⌥I or hover to inspect"}
                </span>
              )}
            </div>
          </>
        }

        // 2. Expanded State: Full Input Bar + Content
        expandedContent={
          <div className="flex flex-col w-full">
            {/* Expanded Content Panels (Chat, Inspections etc) */}
            {
              activePanel !== "none" && (
                <div className="mb-2 w-full max-h-[60vh] overflow-hidden flex flex-col border-b border-border/50 pb-2">
                  {/* Inspection Queue Section */}
                  {activePanel === "inspections" && inspectionItems.length > 0 && (
                    <div className="border-b border-border">
                      <InspectionQueue items={inspectionItems} onRemove={onRemoveInspection} />
                    </div>
                  )}

                  {/* Message Detail Section */}
                  {activePanel === "chat" && (
                    <div className="h-[500px] w-full">
                      <MessageDetail messages={messages} status={status} selectedAgent={selectedAgent} />
                    </div>
                  )}
                </div>
              )
            }
            {/* Top Input Bar */}
            <div className="flex items-center w-full gap-3 h-9">
              {/* Main Status Icon (Left) */}
              {/* Main Status Icon (Left) - Acts as Agent Selector */}
              <div className="relative flex items-center gap-3 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setIsAgentSelectorOpen(!isAgentSelectorOpen)}
                  className="relative flex items-center justify-center w-8 h-8 rounded-full bg-accent/50 text-foreground flex-shrink-0 hover:bg-accent cursor-pointer transition-colors"
                  title="Select Agent"
                >
                  {isAgentWorking ? (
                    <>
                      <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
                      <Sparkles className="w-4 h-4 animate-pulse text-primary" />
                    </>
                  ) : inspectionStatus && inspectionStatus.status !== "in-progress" ? (
                    inspectionStatus.status === "completed" ? (
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-500" />
                    )
                  ) : isError ? (
                    <XCircle className="w-5 h-5 text-red-500" />
                  ) : (
                    /* Show Agent Icon when idle */
                    AVAILABLE_AGENTS.find((a) => a.name === selectedAgent)?.meta?.icon ? (
                      <img
                        src={AVAILABLE_AGENTS.find((a) => a.name === selectedAgent)?.meta?.icon}
                        alt="Agent"
                        className="w-5 h-5 object-contain"
                      />
                    ) : (
                      <Sparkles className="w-5 h-5 text-foreground" />
                    )
                  )}
                </button>

                {/* Agent Selector Dropdown */}
                {isAgentSelectorOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-[999998]"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsAgentSelectorOpen(false);
                      }}
                    />
                    <div className="absolute bottom-full left-0 mb-2 w-64 bg-popover border border-border rounded-lg shadow-lg overflow-hidden z-[999999] animate-in fade-in zoom-in-95 duration-200">
                      {AVAILABLE_AGENTS.map((agent) => (
                        <div
                          key={agent.name}
                          className={cn(
                            "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors group cursor-pointer",
                            selectedAgent === agent.name && "bg-accent/50 font-medium",
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedAgent(agent.name);
                            setIsAgentSelectorOpen(false);
                          }}
                        >
                          {agent.meta?.icon && (
                            <img src={agent.meta.icon} alt="" className="w-4 h-4 flex-shrink-0" />
                          )}
                          <span className="flex-1">{agent.name}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                <div className="w-px h-4 bg-border flex-shrink-0" />
              </div>

              <button
                onClick={onToggleInspector}
                className={cn(
                  "relative flex items-center justify-center w-7 h-7 rounded-full transition-colors flex-shrink-0",
                  isActive
                    ? "bg-blue-500 text-white shadow-[0_0_15px_rgba(59,130,246,0.5)]"
                    : "bg-accent text-muted-foreground hover:bg-accent/80 hover:text-foreground",
                )}
                title="Toggle Inspector (⌥I)"
              >
                <Eye className="w-3.5 h-3.5" />
              </button>

              <div className="w-px h-4 bg-border flex-shrink-0" />

              {/* Inspection Count Button */}
              {inspectionCount > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      setActivePanel((current) => (current === "inspections" ? "none" : "inspections"))
                    }
                    className={cn(
                      "relative flex items-center justify-center w-7 h-7 rounded-full transition-colors flex-shrink-0",
                      "hover:bg-accent/50",
                      activePanel === "inspections" && "bg-accent/50 text-foreground",
                    )}
                    title="View Inspections"
                  >
                    <Inbox className="w-3.5 h-3.5" />
                    <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[12px] h-[12px] px-0.5 text-[8px] font-bold text-white bg-red-500 rounded-full border border-background shadow-sm leading-none">
                      {inspectionCount > 99 ? "99+" : inspectionCount}
                    </span>
                  </button>
                  <div className="w-px h-4 bg-border flex-shrink-0" />
                </>
              )}

              {/* Agent Selector & Input Area */}
              <form
                onSubmit={handleSubmit}
                className="flex-1 flex items-center gap-2 min-w-0"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Text Input */}
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={isAgentWorking ? "Agent is working..." : `Ask ${selectedAgent}...`}
                  className="w-full bg-transparent border-none outline-none text-foreground placeholder-muted-foreground text-sm h-7 disabled:opacity-50"
                  tabIndex={0}
                  disabled={isAgentWorking}
                />

                {/* Submit / Cancel Buttons */}
                {isAgentWorking ? (
                  <button
                    type="button"
                    onClick={onCancel}
                    className="flex items-center justify-center w-7 h-7 rounded-full bg-destructive text-destructive-foreground transition-all flex-shrink-0 hover:bg-destructive/90"
                    title="Cancel request"
                  >
                    <Square className="w-3 h-3" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!input.trim()}
                    className={cn(
                      "flex items-center justify-center w-7 h-7 rounded-full transition-all flex-shrink-0",
                      input.trim()
                        ? "bg-foreground text-background scale-100"
                        : "bg-accent text-muted-foreground/50 scale-90",
                    )}
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )
                }

                {/* Expand/Collapse Chat Button */}
                {
                  (messages.length > 0 || isAgentWorking || isLocked) && (
                    <button
                      type="button"
                      onClick={() => setActivePanel((current) => (current === "chat" ? "none" : "chat"))}
                      className={cn(
                        "flex items-center justify-center w-7 h-7 rounded-full transition-all flex-shrink-0",
                        activePanel === "chat"
                          ? "bg-foreground text-background"
                          : "bg-accent text-muted-foreground hover:bg-accent/80 hover:text-foreground",
                      )}
                      title={activePanel === "chat" ? "Collapse" : "Expand messages"}
                    >
                      <ChevronUp
                        className={cn(
                          "w-3.5 h-3.5 transition-transform duration-300",
                          activePanel === "chat" && "rotate-180",
                        )}
                      />
                    </button>
                  )
                }
              </form >
            </div >


          </div >
        }
      />

      {/* Config Info Modal - using Dialog component */}
      {
        configInfoAgent && (() => {
          const agent = AVAILABLE_AGENTS.find(a => a.name === configInfoAgent);
          if (!agent) return null;
          return (
            <Dialog open={!!configInfoAgent} onOpenChange={() => setConfigInfoAgent(null)}>
              <DialogContent onClose={() => setConfigInfoAgent(null)} className="w-80">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-3">
                    {agent.meta?.icon && (
                      <img src={agent.meta.icon} alt="" className="w-6 h-6" />
                    )}
                    {agent.name}
                  </DialogTitle>
                  {agent.configHint && (
                    <DialogDescription>{agent.configHint}</DialogDescription>
                  )}
                </DialogHeader>
                {agent.configLink && (
                  <a
                    href={agent.configLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-blue-500 hover:text-blue-600 underline"
                  >
                    View ACP Documentation →
                  </a>
                )}
              </DialogContent>
            </Dialog>
          );
        })()
      }
    </>
  );
};
