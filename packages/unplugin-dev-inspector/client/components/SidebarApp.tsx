import React, { useState, useRef, useEffect } from "react";
import { cn } from "../lib/utils";
import {
    Terminal,
    Inbox,
    Send,
    PanelLeftClose,
    PanelLeftOpen,
    RefreshCw,
    Wifi,
    WifiOff,
} from "lucide-react";
import { GetPromptResultSchema } from "@modelcontextprotocol/sdk/types.js";
import type { UIMessage } from "ai";
import { InspectionQueue, type InspectionItem } from "./InspectionQueue";
import type { McpClientType } from "../hooks/useMcp";
import { MessageDetail } from "./MessageDetail";
import { useIslandState } from "../hooks/useIslandState";
import { AVAILABLE_AGENTS, DEFAULT_AGENT } from "../constants/agents";
import { useAgent } from "../hooks/useAgent";
import type { Agent, Prompt } from "../constants/types";
import { getAvailableAgents, getDevServerBaseUrl } from "../utils/config-loader";
import { usePrompts } from "../hooks/usePrompts";
import { PromptParamsDialog } from "./PromptParamsDialog";
import { ScrollArea } from "./ui/scroll-area";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "./ui/tooltip";

interface SidebarAppProps {
    onSubmitAgent: (query: string, agent: Agent, sessionId?: string) => void;
    onCancel?: () => void;
    isAgentWorking: boolean;
    messages: UIMessage[];
    status: "streaming" | "submitted" | "ready" | "error";
    inspectionCount?: number;
    inspectionItems?: InspectionItem[];
    onRemoveInspection?: (id: string) => void;
    toolsReady?: boolean;
    mcpClient?: McpClientType | null;
    onAgentChange?: (agentName: string) => void;
    /** Connection status for MCP */
    connectionStatus?: "connected" | "connecting" | "disconnected" | "error";
}

export const SidebarApp = ({
    onSubmitAgent,
    onCancel,
    isAgentWorking,
    messages,
    status,
    inspectionCount = 0,
    inspectionItems = [],
    onRemoveInspection = () => { },
    toolsReady = true,
    mcpClient = null,
    onAgentChange,
    connectionStatus = "disconnected",
}: SidebarAppProps) => {
    const [input, setInput] = useState("");
    const [isContextPanelOpen, setIsContextPanelOpen] = useState(true);

    const { agent: selectedAgent, setAgent: setSelectedAgent, isReady } = useAgent(DEFAULT_AGENT);
    const [availableAgents, setAvailableAgents] = useState<Agent[]>(AVAILABLE_AGENTS);
    const [isAgentSelectorOpen, setIsAgentSelectorOpen] = useState(false);

    const { prompts } = usePrompts(mcpClient || null);

    // Load available agents (merged with server config)
    useEffect(() => {
        getAvailableAgents().then((agents) => {
            setAvailableAgents(agents);
        });
    }, []);

    // Notify parent when agent changes
    useEffect(() => {
        if (isReady && selectedAgent) {
            onAgentChange?.(selectedAgent);
        }
    }, [selectedAgent, isReady, onAgentChange]);

    // Use state machine to derive Dynamic Island state from messages
    const { chatStatus } = useIslandState(messages, status, false);

    // Derived booleans
    const isWorking = chatStatus === "submitted" || chatStatus === "streaming";

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
            // Fall back to fetch
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
        if (!isReady || !toolsReady) return;

        let mounted = true;
        const currentAgent =
            availableAgents.find((a) => a.name === selectedAgent) || availableAgents[0] || AVAILABLE_AGENTS[0];

        const initSession = async () => {
            // Cleanup previous session
            if (sessionIdRef.current) {
                try {
                    await fetch(`${getDevServerBaseUrl()}/api/acp/cleanup-session`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ sessionId: sessionIdRef.current }),
                    });
                } catch (e) {
                    console.warn("[SidebarApp] Failed to cleanup previous session:", e);
                }
                sessionIdRef.current = null;
                if (mounted) setSessionId(null);
            }

            console.log(`[SidebarApp] Initializing session for ${currentAgent.name}...`);

            try {
                const response = await fetch(`${getDevServerBaseUrl()}/api/acp/init-session`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        agent: currentAgent,
                        envVars: {},
                    }),
                });

                if (!response.ok) throw new Error("Failed to init session");

                const data = await response.json();
                if (mounted && data.sessionId) {
                    console.log(`[SidebarApp] Session initialized: ${data.sessionId}`);
                    setSessionId(data.sessionId);
                    sessionIdRef.current = data.sessionId;
                    didCleanupSessionRef.current = false;
                }
            } catch (error) {
                console.error("[SidebarApp] Failed to initialize session:", error);
            }
        };

        initSession();

        return () => {
            mounted = false;
        };
    }, [selectedAgent, isReady, toolsReady, availableAgents]);

    // Cleanup on page unload
    useEffect(() => {
        const onPageHide = () => {
            const sid = sessionIdRef.current;
            if (!sid || didCleanupSessionRef.current) return;
            didCleanupSessionRef.current = true;
            cleanupSession(sid);
        };

        window.addEventListener("pagehide", onPageHide);
        return () => window.removeEventListener("pagehide", onPageHide);
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            const sid = sessionIdRef.current;
            if (!sid || didCleanupSessionRef.current) return;
            didCleanupSessionRef.current = true;
            cleanupSession(sid);
        };
    }, []);

    // Get current agent info
    const currentAgent =
        availableAgents.find((a) => a.name === selectedAgent) || availableAgents[0] || AVAILABLE_AGENTS[0];

    const inputRef = useRef<HTMLTextAreaElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const [selectedPromptForParams, setSelectedPromptForParams] = useState<Prompt | null>(null);

    const executePrompt = async (prompt: Prompt, args: Record<string, string> = {}) => {
        if (mcpClient) {
            try {
                const result = await mcpClient.request(
                    {
                        method: "prompts/get",
                        params: { name: prompt.name, arguments: args },
                    },
                    GetPromptResultSchema
                );

                const message = result.messages?.[0];
                if (message?.content?.type === "text" && message.content.text) {
                    setInput(message.content.text);
                    inputRef.current?.focus();
                    return;
                }
            } catch (e) {
                console.error("Failed to execute prompt:", e);
            }
        }

        const text = prompt.template || prompt.description || prompt.name;
        setInput(text);
        inputRef.current?.focus();
    };

    const handlePromptSelect = async (prompt: Prompt) => {
        if (prompt.arguments && prompt.arguments.length > 0) {
            setSelectedPromptForParams(prompt);
            return;
        }
        await executePrompt(prompt);
    };

    const handlePromptParamsSubmit = (args: Record<string, string>) => {
        if (selectedPromptForParams) {
            executePrompt(selectedPromptForParams, args);
            setSelectedPromptForParams(null);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim()) return;

        const agentToSubmit =
            availableAgents.find((a) => a.name === selectedAgent) || availableAgents[0] || AVAILABLE_AGENTS[0];
        onSubmitAgent(input, agentToSubmit, sessionId || undefined);
        setInput("");
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    };


    const getConnectionStatusColor = () => {
        switch (connectionStatus) {
            case "connected":
                return "text-green-500";
            case "connecting":
                return "text-yellow-500 animate-pulse";
            case "error":
                return "text-red-500";
            default:
                return "text-muted-foreground";
        }
    };

    const getConnectionStatusIcon = () => {
        switch (connectionStatus) {
            case "connected":
                return <Wifi className="w-4 h-4" />;
            case "connecting":
                return <RefreshCw className="w-4 h-4 animate-spin" />;
            default:
                return <WifiOff className="w-4 h-4" />;
        }
    };

    return (
        <TooltipProvider>
            <PromptParamsDialog
                prompt={selectedPromptForParams}
                isOpen={!!selectedPromptForParams}
                onOpenChange={(open) => !open && setSelectedPromptForParams(null)}
                onSubmit={handlePromptParamsSubmit}
            />

            <div className="flex flex-col h-screen bg-background text-foreground">
                {/* Header */}
                {/* Header */}
                <header className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
                    <div className="flex items-center gap-3">
                        {/* Agent Selector */}
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setIsAgentSelectorOpen(!isAgentSelectorOpen)}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors border border-transparent hover:border-border/50"
                            >
                                {currentAgent?.meta?.icon && (
                                    <img src={currentAgent.meta.icon} alt="" className="w-4 h-4" />
                                )}
                                <span className="text-sm font-medium">{selectedAgent}</span>
                            </button>

                            {isAgentSelectorOpen && (
                                <>
                                    <div className="fixed inset-0 z-40" onClick={() => setIsAgentSelectorOpen(false)} />
                                    <div className="absolute top-full left-0 mt-2 w-64 bg-popover border border-border rounded-lg shadow-lg overflow-hidden z-50 animate-in fade-in zoom-in-95">
                                        {availableAgents.map((agent) => (
                                            <button
                                                key={agent.name}
                                                onClick={() => {
                                                    setSelectedAgent(agent.name);
                                                    setIsAgentSelectorOpen(false);
                                                }}
                                                className={cn(
                                                    "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors text-left",
                                                    selectedAgent === agent.name && "bg-accent/50 font-medium"
                                                )}
                                            >
                                                {agent.meta?.icon && (
                                                    <img src={agent.meta.icon} alt="" className="w-4 h-4 flex-shrink-0" />
                                                )}
                                                <span className="flex-1">{agent.name}</span>
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Connection Status */}
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div className={cn("flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium border border-border/50", getConnectionStatusColor())}>
                                    {getConnectionStatusIcon()}
                                    <span className="capitalize">{connectionStatus}</span>
                                </div>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>MCP Connection: {connectionStatus}</p>
                            </TooltipContent>
                        </Tooltip>

                        {/* Context Toggle */}
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    onClick={() => setIsContextPanelOpen(!isContextPanelOpen)}
                                    className={cn(
                                        "p-2 rounded-lg transition-colors border border-transparent",
                                        isContextPanelOpen
                                            ? "bg-secondary text-foreground"
                                            : "text-muted-foreground hover:text-foreground hover:bg-secondary/50 hover:border-border/50"
                                    )}
                                >
                                    {isContextPanelOpen ? (
                                        <PanelLeftClose className="w-4 h-4" />
                                    ) : (
                                        <PanelLeftOpen className="w-4 h-4" />
                                    )}
                                </button>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>{isContextPanelOpen ? "Hide Context Panel" : "Show Context Panel"}</p>
                            </TooltipContent>
                        </Tooltip>
                    </div>
                </header>

                {/* Main Content */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Context Panel (Left) */}
                    {isContextPanelOpen && (
                        <div className="w-64 border-r border-border/40 flex flex-col bg-muted/10">
                            <div className="p-3 border-b border-border/40 min-h-[45px] flex items-center">
                                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                                    <Inbox className="w-3.5 h-3.5" />
                                    Context
                                    {inspectionCount > 0 && (
                                        <span className="px-1.5 py-0.5 text-[10px] bg-primary text-primary-foreground rounded-full ml-auto">
                                            {inspectionCount}
                                        </span>
                                    )}
                                </h3>
                            </div>

                            <ScrollArea className="flex-1">
                                <div className="p-3 space-y-2">
                                    {inspectionItems.length > 0 ? (
                                        <InspectionQueue items={inspectionItems} onRemove={onRemoveInspection} />
                                    ) : (
                                        <div className="flex flex-col items-center justify-center py-12 px-4 text-center text-muted-foreground/40">
                                            <Inbox className="w-10 h-10 mb-3 opacity-20" />
                                            <p className="text-sm font-medium mb-1">No Context</p>
                                            <span className="text-[10px] max-w-[120px] leading-tight">
                                                Use the Inspector in your app to add elements.
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </ScrollArea>

                            {/* Prompts Section */}
                            {prompts.length > 0 && (
                                <div className="border-t border-border/40 bg-muted/5">
                                    <div className="p-3">
                                        <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-2 flex items-center gap-1.5">
                                            <span className="w-1 h-1 rounded-full bg-primary/40 inline-block" />
                                            Quick Prompts
                                        </h4>
                                        <div className="space-y-0.5">
                                            {prompts.slice(0, 5).map((prompt) => (
                                                <button
                                                    key={prompt.name}
                                                    onClick={() => handlePromptSelect(prompt)}
                                                    className="w-full text-left px-3 py-2 text-xs rounded-md hover:bg-background hover:text-foreground hover:shadow-sm hover:border-border/50 text-muted-foreground transition-all truncate border border-transparent"
                                                    title={prompt.description || prompt.name}
                                                >
                                                    {prompt.name}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Chat Area */}
                    <div className="flex-1 flex flex-col min-w-0">
                        {/* Messages */}
                        <ScrollArea className="flex-1">
                            <div className="p-4 space-y-4">
                                {messages.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full py-12 text-center text-muted-foreground">
                                        <div className="w-16 h-16 rounded-full bg-accent flex items-center justify-center mb-4">
                                            {currentAgent?.meta?.icon ? (
                                                <img src={currentAgent.meta.icon} alt="" className="w-8 h-8" />
                                            ) : (
                                                <Terminal className="w-8 h-8" />
                                            )}
                                        </div>
                                        <h2 className="text-lg font-medium text-foreground mb-2">
                                            Start a conversation with {selectedAgent}
                                        </h2>
                                        <p className="text-sm max-w-md">
                                            Ask questions, get help with code, or use the Inspector in your app to capture context.
                                        </p>
                                    </div>
                                ) : (
                                    <MessageDetail messages={messages} status={status} selectedAgent={selectedAgent} />
                                )}

                                <div ref={messagesEndRef} />
                            </div>
                        </ScrollArea>

                        {/* Input Area */}
                        <div className="border-t border-border/40 p-4 bg-background/50 backdrop-blur-sm">
                            <form onSubmit={handleSubmit} className="relative flex items-end rounded-xl border border-input shadow-sm bg-background focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/50 transition-all">
                                <textarea
                                    ref={inputRef}
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder={`Message ${selectedAgent}...`}
                                    rows={1}
                                    className="w-full min-h-[44px] max-h-[200px] px-4 py-3 pr-12 bg-transparent text-sm placeholder:text-muted-foreground resize-none outline-none disabled:opacity-50 no-scrollbar block"
                                    disabled={isWorking}
                                    style={{ height: "44px" }}
                                />

                                <div className="absolute right-1.5 bottom-1.5">
                                    {isWorking ? (
                                        <button
                                            type="button"
                                            onClick={onCancel}
                                            className="p-2 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
                                            aria-label="Stop generating"
                                        >
                                            <span className="w-4 h-4 block bg-current rounded-sm" />
                                        </button>
                                    ) : (
                                        <button
                                            type="submit"
                                            disabled={!input.trim()}
                                            className={cn(
                                                "p-2 rounded-lg transition-all",
                                                input.trim()
                                                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                                                    : "bg-muted text-muted-foreground cursor-not-allowed"
                                            )}
                                            aria-label="Send message"
                                        >
                                            <Send className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        </TooltipProvider>
    );
};
