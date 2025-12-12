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
import { Shimmer } from "../../src/components/ai-elements/shimmer";
import type { UIMessage } from "ai";
import { processMessage, extractToolName } from "../utils/messageProcessor";
import { InspectionQueue, type InspectionItem } from "./InspectionQueue";
import { MessageDetail } from "./MessageDetail";
import { useTextBuffer } from "../hooks/useTextBuffer";
import { AVAILABLE_AGENTS, DEFAULT_AGENT } from "../constants/agents";
import { useDraggable } from "../hooks/useDraggable";
import { useAgent } from "../hooks/useAgent";
interface InspectorBarProps {
  isActive: boolean;
  onToggleInspector: () => void;
  onSubmitAgent: (query: string, agentName: string) => void;
  onCancel?: () => void;
  isAgentWorking: boolean;
  messages: UIMessage[];
  status: "streaming" | "submitted" | "ready" | "error";
  inspectionCount?: number;
  inspectionItems?: InspectionItem[];
  onRemoveInspection?: (id: string) => void;
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
}: InspectorBarProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [input, setInput] = useState("");
  const [toolCall, setToolCall] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<"none" | "inspections" | "chat">("none");
  const [hideInputDuringWork, setHideInputDuringWork] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [allowHover, setAllowHover] = useState(true);
  const { agent: selectedAgent, setAgent: setSelectedAgent } = useAgent(DEFAULT_AGENT);
  const [isAgentSelectorOpen, setIsAgentSelectorOpen] = useState(false);

  // Get current agent info
  const currentAgent =
    AVAILABLE_AGENTS.find((a) => a.name === selectedAgent) || AVAILABLE_AGENTS[0];

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

  // accumulatedText tracks the full message history for reference
  const [accumulatedText, setAccumulatedText] = useState<string>("");

  // Use the text buffer hook to handle smooth text updates
  const bufferedText = useTextBuffer(accumulatedText, isAgentWorking, 50);

  // Only show the new fragment of text, not the whole history
  const [visibleFragment, setVisibleFragment] = useState("");
  const lastProcessedTextRef = useRef("");
  const prevVisibleFragmentRef = useRef("");

  // Effect to calculate visible fragment from buffered text
  useEffect(() => {
    const currentFullText = bufferedText;
    const lastFullText = lastProcessedTextRef.current;

    // 1. Handle Reset/Context Switch
    if (currentFullText.length < lastFullText.length || !currentFullText.startsWith(lastFullText)) {
      setVisibleFragment(currentFullText);
      lastProcessedTextRef.current = currentFullText;
      return;
    }

    // 2. Handle Incremental Update
    if (currentFullText.length > lastFullText.length) {
      const newPart = currentFullText.slice(lastFullText.length).trim();
      // Only update if there is meaningful content
      if (newPart) {
        setVisibleFragment(newPart);
      }
      lastProcessedTextRef.current = currentFullText;
    }
  }, [bufferedText]);

  // Refs
  const inputRef = useRef<HTMLInputElement>(null);
  // containerRef is now provided by useDraggable
  const toolClearTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSeenToolNameRef = useRef<string | null>(null);
  const isToolActiveRef = useRef(false);

  // Main effect: Process messages
  useEffect(() => {
    if (messages.length === 0) {
      setAccumulatedText("");
      setToolCall(null);
      lastSeenToolNameRef.current = null;
      isToolActiveRef.current = false;
      setVisibleFragment("");
      lastProcessedTextRef.current = "";
      return;
    }

    // KISS: Only process the LAST message (the one that's being updated)
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role !== "assistant") return;

    // Extract tool and text from the last message
    const extractedTool = extractToolName(lastMessage);
    const { displayText: messageText, toolCall: activeToolCall } = processMessage(
      lastMessage,
      extractedTool || lastSeenToolNameRef.current,
    );

    // Update accumulated text
    const currentText = messageText || "";
    setAccumulatedText(currentText);

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
  }, [messages]);

  // Effect to clear tool when text updates
  useEffect(() => {
    if (visibleFragment !== prevVisibleFragmentRef.current) {
      // If text has updated and no tool is currently active, clear the tool display
      // This ensures we keep showing the tool name until the text actually appears
      if (!isToolActiveRef.current) {
        setToolCall(null);
      }
      prevVisibleFragmentRef.current = visibleFragment;
    }
  }, [visibleFragment]);

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
      setHideInputDuringWork(false);
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
    setAccumulatedText("");
    setVisibleFragment("");
    setInspectionStatus(null);
    lastSeenToolNameRef.current = null;
    lastProcessedTextRef.current = "";
    setHideInputDuringWork(true);
    setIsLocked(true);

    onSubmitAgent(input, selectedAgent);
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
  const hasMessage = messages.length > 0;
  const shouldShowInput = isExpanded && !hideInputDuringWork;
  const showMessage =
    (!isExpanded || hideInputDuringWork) && (isAgentWorking || hasMessage || inspectionStatus);

  return (
    <div
      ref={containerRef}
      className={cn(
        "fixed bottom-8 left-1/2 z-[999999]", // Revert to CSS positioning
        "transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]",
        isExpanded ? "w-[450px]" : showMessage ? "w-auto min-w-[200px] max-w-[450px]" : "w-[190px]",
        isDragging ? "cursor-grabbing" : "cursor-grab",
      )}
      onMouseDown={handleMouseDown}
      onMouseEnter={() => {
        if (!isDragging) {
          if (isAgentWorking || isLocked) {
            // When agent is working, show the chat panel on hover
            setIsExpanded(true);
            setActivePanel("chat");
          } else if (allowHover) {
            setIsExpanded(true);
          }
        }
      }}
      onMouseLeave={() => {
        if (!input.trim() && !isLocked && !isDragging) {
          setIsExpanded(false);
          setActivePanel("none");
        }
        // Re-enable hover when mouse leaves
        setAllowHover(true);
      }}
    >
      <div
        className={cn(
          "relative flex items-center backdrop-blur-xl shadow-2xl border border-border",
          "transition-[width,height,padding,background-color,border-color] duration-200 ease-out",
          isExpanded ? "h-12 p-2 pl-4" : "h-9 px-2 py-1",
          activePanel !== "none"
            ? "bg-muted/95 rounded-b-lg rounded-t-none border-t-0"
            : "bg-muted/90 rounded-full",
          isError && !isExpanded && "bg-destructive/10 border-destructive/20",
        )}
      >
        <div
          className={cn(
            "flex items-center transition-opacity duration-300 w-full relative",
            shouldShowInput
              ? "absolute left-3 opacity-0 pointer-events-none"
              : "relative opacity-100",
          )}
        >
          {!showMessage && (
            <>
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-accent flex-shrink-0">
                <Sparkles className="w-3.5 h-3.5 text-foreground" />
              </div>
              <span className="text-xs text-muted-foreground/70 ml-3 whitespace-nowrap">⌥I or hover to inspect</span>
            </>
          )}

          {showMessage && (
            <>
              {/* Fixed left icon group */}
              <div className="flex items-center gap-3 flex-shrink-0">
                <div className="relative flex items-center justify-center w-6 h-6 rounded-full bg-accent flex-shrink-0">
                  {isAgentWorking ? (
                    <>
                      <div className="absolute inset-0 rounded-full border-2 border-current opacity-20 animate-ping text-foreground" />
                      <Sparkles className="w-3.5 h-3.5 animate-pulse text-foreground" />
                    </>
                  ) : inspectionStatus ? (
                    inspectionStatus.status === "in-progress" ? (
                      <>
                        <div className="absolute inset-0 rounded-full border-2 border-current opacity-20 animate-ping text-blue-500" />
                        <Terminal className="w-3.5 h-3.5 animate-pulse text-blue-500" />
                      </>
                    ) : inspectionStatus.status === "completed" ? (
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-500" />
                    )
                  ) : isError ? (
                    <XCircle className="w-5 h-5 text-red-500" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  )}
                </div>
                <div className="w-px h-4 bg-border flex-shrink-0" />
              </div>

              {/* Centered text content */}
              <div className="flex-1 flex justify-center min-w-0 pl-2">
                <div className="flex flex-col min-w-0 max-w-full pr-2 max-h-[24px] overflow-hidden">
                  {inspectionStatus &&
                    inspectionStatus.status === "in-progress" &&
                    inspectionStatus.currentStep ? (
                    <div className="flex items-center gap-1.5 text-sm font-medium text-foreground min-w-0">
                      <Terminal className="w-4 h-4 flex-shrink-0" />
                      <span className="truncate min-w-0">
                        Step {inspectionStatus.currentStep.index}/
                        {inspectionStatus.currentStep.total}: {inspectionStatus.currentStep.title}
                      </span>
                    </div>
                  ) : inspectionStatus?.message ? (
                    <div className="text-sm font-medium leading-[1.4] text-foreground truncate min-w-0">
                      {inspectionStatus.message}
                    </div>
                  ) : toolCall ? (
                    <div className="flex items-center gap-1.5 text-sm font-medium text-foreground min-w-0">
                      <Terminal className="w-4 h-4 flex-shrink-0" />
                      <span className="truncate min-w-0">{toolCall}</span>
                    </div>
                  ) : (
                    <div className="text-sm font-medium leading-[1.4] text-foreground truncate min-w-0">
                      {isAgentWorking && !visibleFragment ? (
                        <Shimmer duration={2} spread={2}>
                          {status === "submitted" && currentAgent?.command === "npx"
                            ? `Starting ${currentAgent.name}... This may take a moment.`
                            : "Thinking..."}
                        </Shimmer>
                      ) : (
                        visibleFragment || "Processing..."
                      )}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <div
          className={cn(
            "flex items-center w-full gap-3 transition-all duration-500 delay-75",
            shouldShowInput
              ? "opacity-100 translate-y-0 relative pointer-events-auto"
              : "opacity-0 translate-y-4 pointer-events-none absolute top-2 left-4 right-2",
          )}
          onClick={(e) => e.stopPropagation()}
        >
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

          <form
            onSubmit={handleSubmit}
            className="flex-1 flex items-center gap-2 min-w-0"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Agent Selector */}
            <div className="relative flex-shrink-0">
              <button
                type="button"
                onClick={() => setIsAgentSelectorOpen(!isAgentSelectorOpen)}
                className="flex items-center justify-center w-7 h-7 rounded-full hover:bg-accent/50 transition-colors"
                title="Select Agent"
              >
                <img
                  src={AVAILABLE_AGENTS.find((a) => a.name === selectedAgent)?.meta?.icon}
                  alt={selectedAgent}
                  className="w-3.5 h-3.5"
                />
              </button>

              {isAgentSelectorOpen && (
                <>
                  <div
                    className="fixed inset-0 z-[999998]"
                    onClick={() => setIsAgentSelectorOpen(false)}
                  />
                  <div className="absolute bottom-full left-0 mb-2 w-48 bg-popover border border-border rounded-lg shadow-lg overflow-hidden z-[999999] animate-in fade-in zoom-in-95 duration-200">
                    {AVAILABLE_AGENTS.map((agent) => (
                      <button
                        key={agent.name}
                        onClick={() => {
                          setSelectedAgent(agent.name);
                          setIsAgentSelectorOpen(false);
                        }}
                        className={cn(
                          "w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent transition-colors",
                          selectedAgent === agent.name && "bg-accent/50 font-medium",
                        )}
                      >
                        {agent.meta?.icon && (
                          <img src={agent.meta.icon} alt="" className="w-4 h-4" />
                        )}
                        {agent.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Ask ${selectedAgent}...`}
              className="w-full bg-transparent border-none outline-none text-foreground placeholder-muted-foreground text-sm h-7 disabled:opacity-50"
              tabIndex={0}
              disabled={isAgentWorking}
            />

            {/* Expand button - only show when AI is working or has messages */}
            {(messages.length > 0 || isAgentWorking || isLocked) && (
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
            )}

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
            )}
          </form>
        </div>
      </div>

      {/* Expanded Panel - shows above the bar */}
      {activePanel !== "none" && (
        <div className="absolute bottom-full left-0 right-0 pointer-events-auto max-w-[450px] mx-auto animate-panel-in">
          <div className="bg-muted/95 backdrop-blur-xl rounded-t-xl border border-border border-b-0 shadow-2xl overflow-hidden">
            {/* Inspection Queue Section */}
            {activePanel === "inspections" && inspectionItems.length > 0 && (
              <div className="border-b border-border">
                <InspectionQueue items={inspectionItems} onRemove={onRemoveInspection} />
              </div>
            )}

            {/* Message Detail Section - Show InspectorBar messages */}
            {activePanel === "chat" && (
              <div className="h-[500px]">
                <MessageDetail messages={messages} status={status} selectedAgent={selectedAgent} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
