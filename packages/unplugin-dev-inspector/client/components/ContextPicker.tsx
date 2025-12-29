import React, { useState, useEffect } from "react";
import type { Client } from "@modelcontextprotocol/sdk/client";
import type { InspectedElement } from "../types";
import { useContextData } from "../hooks/useContextData";
import { Loader2, RefreshCw, Code, Type, Search, X, Sparkles } from "lucide-react";
import { cn } from "../lib/utils";
import type { ConsoleMessage, NetworkRequest } from "../types";
import { NetworkRequestItem } from "./NetworkRequestItem";
import { useChat, type UIMessage } from "@ai-sdk/react";
import { getDevServerBaseUrl } from "../utils/config-loader";
import { DefaultChatTransport } from "ai";
import { DEFAULT_AGENT, AVAILABLE_AGENTS } from "../constants/agents";

function getContextSelectorArgs(message: UIMessage): ContextSelectorArgs | null {
    const m = message as unknown as { parts?: unknown[] };
    if (!m.parts || !Array.isArray(m.parts)) return null;

    for (const part of m.parts) {
        // Inline structural typing to avoid defining interfaces at file scope
        const p = part as { type: unknown; input?: { toolName: unknown; args: unknown } };
        if (
            typeof p.type === "string" &&
            p.type.startsWith("tool-") &&
            p.input &&
            typeof p.input.toolName === "string" &&
            p.input.toolName.includes("context_selector")
        ) {
            return p.input.args as ContextSelectorArgs;
        }
    }
    return null;
}

export interface SelectedContext {
    /** Include element source info */
    includeElement: boolean;
    /** Include computed styles */
    includeStyles: boolean;
    consoleIds: number[];
    networkIds: number[];
    /** AI reasoning for the selection */
    reasoning?: string;
}

interface ContextPickerProps {
    client: Client | null;
    isClientReady: boolean;
    /** Source info of the inspected element */
    sourceInfo?: InspectedElement;
    selectedContext: SelectedContext;
    onSelectionChange: (context: SelectedContext | ((prev: SelectedContext) => SelectedContext)) => void;
    /** Callback when data is loaded, provides console/network data for parent */
    onDataReady?: (data: {
        consoleMessages: ConsoleMessage[];
        networkRequests: NetworkRequest[];
        networkDetails: Record<number, string>;
    }) => void;
    /** Whether the inspection is automated */
    isAutomated?: boolean;
    /** User input to guide the context selection */
    userInput?: string;
}

interface ContextSelectorArgs {
    consoleIds?: number[];
    networkIds?: number[];
    includeElement?: boolean;
    includeStyles?: boolean;
    reasoning?: string;
}

type TabType = "code" | "styles" | "console" | "network";

export const ContextPicker: React.FC<ContextPickerProps> = ({
    client,
    isClientReady,
    sourceInfo,
    selectedContext,
    onSelectionChange,
    onDataReady,
    isAutomated = false,
    userInput
}) => {
    const [activeTab, setActiveTab] = useState<TabType>("code");
    const [consoleSearch, setConsoleSearch] = useState("");
    const [networkSearch, setNetworkSearch] = useState("");
    const [networkDetails, setNetworkDetails] = useState<Record<number, string>>({});
    const { consoleMessages, networkRequests, loading, error, refresh } = useContextData(client, isClientReady, isAutomated);

    // Filtered lists
    const filteredConsole = consoleSearch
        ? consoleMessages.filter(msg =>
            msg.text.toLowerCase().includes(consoleSearch.toLowerCase()) ||
            msg.level.toLowerCase().includes(consoleSearch.toLowerCase())
        )
        : consoleMessages;

    const filteredNetwork = networkSearch
        ? networkRequests.filter(req =>
            req.url.toLowerCase().includes(networkSearch.toLowerCase()) ||
            req.method.toLowerCase().includes(networkSearch.toLowerCase())
        )
        : networkRequests;

    // Fetch data when expanded
    // Fetch data always since panel is persistent
    useEffect(() => {
        if (isClientReady) {
            refresh();
        }
    }, [isClientReady, refresh]);

    // Notify parent when data is ready
    useEffect(() => {
        if (onDataReady && (consoleMessages.length > 0 || networkRequests.length > 0)) {
            onDataReady({ consoleMessages, networkRequests, networkDetails });
        }
    }, [consoleMessages, networkRequests, networkDetails, onDataReady]);

    const handleNetworkDetailsFetched = (reqid: number, details: string) => {
        setNetworkDetails(prev => ({ ...prev, [reqid]: details }));
    };

    const handleNetworkSelectionChange = (reqid: number, selected: boolean) => {
        const ids = selected
            ? [...selectedContext.networkIds, reqid]
            : selectedContext.networkIds.filter(id => id !== reqid);
        onSelectionChange({ ...selectedContext, networkIds: ids });
    };

    const totalSelected =
        (selectedContext.includeElement ? 1 : 0) +
        (selectedContext.includeStyles ? 1 : 0) +
        selectedContext.consoleIds.length +
        selectedContext.networkIds.length;

    const toggleElement = () => {
        onSelectionChange({ ...selectedContext, includeElement: !selectedContext.includeElement });
    };

    const toggleStyles = () => {
        onSelectionChange({ ...selectedContext, includeStyles: !selectedContext.includeStyles });
    };

    const toggleConsole = (msgid: number) => {
        const ids = selectedContext.consoleIds.includes(msgid)
            ? selectedContext.consoleIds.filter((id) => id !== msgid)
            : [...selectedContext.consoleIds, msgid];
        onSelectionChange({ ...selectedContext, consoleIds: ids });
    };

    // Chat hook for context inference
    const { messages, status, sendMessage, setMessages } = useChat({
        transport: new DefaultChatTransport({
            api: `${getDevServerBaseUrl()}/api/acp/chat`,
        }),
    });

    const isAnalyzing = status === 'submitted' || status === 'streaming';

    // Watch for tool result
    useEffect(() => {
        // Only process when generation is complete
        if (status === 'streaming' || status === 'submitted') return;

        const lastMsg = messages[messages.length - 1];
        if (!lastMsg) return;

        const args = getContextSelectorArgs(lastMsg);

        // With client-side tools, the args are available in the tool call
        if (args) {
            try {
                // Ensure args is an object if it came as string (keeping robustness)
                let parsedArgs = args;
                if (typeof parsedArgs === 'string') {
                    try {
                        parsedArgs = JSON.parse(parsedArgs);
                    } catch (e) {
                        console.error("Failed to parse tool args JSON", e);
                    }
                }

                const finalArgs = parsedArgs as ContextSelectorArgs;
                console.log('[ContextPicker] Tool call detected:', { args: finalArgs });

                onSelectionChange((selectedContext) => ({
                    ...selectedContext,
                    consoleIds: finalArgs?.consoleIds || [],
                    networkIds: finalArgs?.networkIds || [],
                    includeElement: finalArgs?.includeElement ?? true, // Default to true if not specified
                    includeStyles: finalArgs?.includeStyles ?? false, // Default to false if not specified
                    reasoning: finalArgs?.reasoning
                }));
            } catch (e) {
                console.error("Failed to process context inference args", e);
            }
        }
    }, [messages, status, onSelectionChange]);

    const handleSmartSelect = async () => {
        if (!sourceInfo || isAnalyzing) return;
        setMessages([]);

        const recentConsole = consoleMessages.slice(-50).map(m => `[${m.msgid}] ${m.level}: ${m.text}`).join('\n');
        const recentNetwork = networkRequests.slice(-50).map(r => `[${r.reqid}] ${r.method} ${r.url}`).join('\n');

        const prompt = `
I am inspecting the following element:
${userInput ? `Context/Interests: ${userInput}` : ''}
Tag: ${sourceInfo.elementInfo?.tagName}
File: ${sourceInfo.file}:${sourceInfo.line}
Component: ${sourceInfo.component}

Available Console Logs (Recent 50):
${recentConsole}

Available Network Requests (Recent 50):
${recentNetwork}

Please analyze these logs and requests. You MUST call the context_selector tool to return your selection, even if you select nothing (pass empty arrays). Do not just reply with text.
`;
        const currentAgent = AVAILABLE_AGENTS.find(a => a.name === DEFAULT_AGENT) || AVAILABLE_AGENTS[0];
        await sendMessage(
            { text: prompt },
            {
                body: {
                    agent: currentAgent,
                    envVars: {},
                    inferContext: true,
                    isAutomated: true
                }
            }
        );
    };

    const getLevelColor = (level: string) => {
        switch (level) {
            case "error": return "bg-red-500/20 text-red-500";
            case "warn": return "bg-yellow-500/20 text-yellow-600";
            case "info": return "bg-blue-500/20 text-blue-500";
            case "debug": return "bg-purple-500/20 text-purple-500";
            default: return "bg-muted text-muted-foreground";
        }
    };

    // Extract typography styles from sourceInfo
    const typographyStyles = sourceInfo?.elementInfo?.computedStyles?.typography;

    return (
        <div className="border border-border rounded-md overflow-hidden">
            {/* Collapse Header */}
            {/* Header */}
            <div className="w-full flex items-center justify-between px-3 py-2 text-sm bg-muted/30 border-b border-border">
                <div className="flex items-center gap-2 text-muted-foreground font-medium">
                    <span>Context</span>
                    {totalSelected > 0 && (
                        <span className="px-1.5 py-0.5 text-xs bg-primary text-primary-foreground rounded-full">
                            {totalSelected}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            handleSmartSelect();
                        }}
                        disabled={loading || isAnalyzing}
                        className={cn(
                            "flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded transition-colors border shadow-sm",
                            isAnalyzing
                                ? "bg-blue-100 text-blue-700 border-blue-200"
                                : "bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100 hover:text-blue-700 hover:border-blue-300"
                        )}
                        title="Let AI analyze logs and network to select relevant context"
                    >
                        <Sparkles className={cn("w-3.5 h-3.5", isAnalyzing && "animate-pulse")} />
                        <span>{isAnalyzing ? "Analyzing..." : "Smart Select"}</span>
                    </button>
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            refresh();
                        }}
                        disabled={loading}
                        className="p-1 hover:bg-accent rounded transition-colors"
                        title="Refresh"
                    >
                        <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
                    </button>
                </div>
            </div>

            {/* Content */}
            <div>
                {/* Tabs */}
                <div className="flex gap-1 border-b border-border px-2 pt-1">
                    <button
                        type="button"
                        onClick={() => setActiveTab("code")}
                        className={cn(
                            "px-3 py-1.5 text-xs font-medium transition-colors relative",
                            activeTab === "code" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        Code
                        {selectedContext.includeElement && (
                            <span className="ml-1.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-medium bg-primary text-primary-foreground rounded-full">
                                1
                            </span>
                        )}
                        {activeTab === "code" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" />}
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab("styles")}
                        className={cn(
                            "px-3 py-1.5 text-xs font-medium transition-colors relative",
                            activeTab === "styles" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        Styles
                        {selectedContext.includeStyles && (
                            <span className="ml-1.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-medium bg-primary text-primary-foreground rounded-full">
                                1
                            </span>
                        )}
                        {activeTab === "styles" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" />}
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab("console")}
                        className={cn(
                            "px-3 py-1.5 text-xs font-medium transition-colors relative",
                            activeTab === "console" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        Console
                        {consoleMessages.length > 0 && (
                            <span className="ml-1 text-xs text-muted-foreground">({consoleMessages.length})</span>
                        )}
                        {selectedContext.consoleIds.length > 0 && (
                            <span className="ml-1 px-1 text-[10px] bg-primary text-primary-foreground rounded-full">
                                {selectedContext.consoleIds.length}
                            </span>
                        )}
                        {activeTab === "console" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" />}
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab("network")}
                        className={cn(
                            "px-3 py-1.5 text-xs font-medium transition-colors relative",
                            activeTab === "network" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        Network
                        {networkRequests.length > 0 && (
                            <span className="ml-1 text-xs text-muted-foreground">({networkRequests.length})</span>
                        )}
                        {selectedContext.networkIds.length > 0 && (
                            <span className="ml-1 px-1 text-[10px] bg-primary text-primary-foreground rounded-full">
                                {selectedContext.networkIds.length}
                            </span>
                        )}
                        {activeTab === "network" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" />}
                    </button>
                </div>

                {/* Tab Content */}
                <div className="max-h-[200px] overflow-auto relative">
                    {isAnalyzing && (
                        <div className="absolute inset-0 z-10 bg-background/80 backdrop-blur-sm flex items-center justify-center flex-col gap-2">
                            <Sparkles className="w-5 h-5 text-blue-500 animate-pulse" />
                            <span className="text-xs text-muted-foreground animate-pulse">Analyzing context...</span>
                        </div>
                    )}
                    {error && (activeTab === "console" || activeTab === "network") && (
                        <div className="p-2 text-xs text-destructive">{error}</div>
                    )}

                    {/* Reasoning Display */}
                    {selectedContext.reasoning && !isAnalyzing && (
                        <div className="bg-blue-50/50 p-2 border-b border-border">
                            <div className="flex items-start gap-2">
                                <Sparkles className="w-3.5 h-3.5 text-blue-500 mt-0.5 flex-shrink-0" />
                                <p className="text-xs text-muted-foreground leading-relaxed italic">
                                    {selectedContext.reasoning}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Code Tab */}
                    {activeTab === "code" && (
                        <div className="p-2 space-y-1">
                            {/* Source Location */}
                            <label className="flex items-start gap-2 p-2 rounded hover:bg-accent/50 cursor-pointer transition-colors">
                                <input
                                    type="checkbox"
                                    checked={selectedContext.includeElement}
                                    onChange={toggleElement}
                                    className="mt-0.5 rounded border-border"
                                />
                                <Code className="w-4 h-4 text-blue-500 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <div className="text-xs font-medium text-foreground">Source Location</div>
                                    {sourceInfo && (
                                        <div className="text-xs text-muted-foreground font-mono truncate">
                                            {sourceInfo.component} • {sourceInfo.file}:{sourceInfo.line}:{sourceInfo.column}
                                        </div>
                                    )}
                                </div>
                            </label>
                        </div>
                    )}

                    {/* Styles Tab */}
                    {activeTab === "styles" && (
                        <div className="p-2 space-y-1">
                            <label className="flex items-start gap-2 p-2 rounded hover:bg-accent/50 cursor-pointer transition-colors">
                                <input
                                    type="checkbox"
                                    checked={selectedContext.includeStyles}
                                    onChange={toggleStyles}
                                    className="mt-0.5 rounded border-border"
                                />
                                <Type className="w-4 h-4 text-purple-500 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <div className="text-xs font-medium text-foreground">Computed Styles</div>
                                    {typographyStyles && (
                                        <div className="text-xs text-muted-foreground space-y-0.5 mt-1">
                                            <div className="flex gap-2">
                                                <span className="text-muted-foreground/70">Font:</span>
                                                <span className="font-mono truncate">{typographyStyles.fontFamily}</span>
                                            </div>
                                            <div className="flex gap-2">
                                                <span className="text-muted-foreground/70">Size:</span>
                                                <span className="font-mono">{typographyStyles.fontSize}</span>
                                                <span className="text-muted-foreground/70 ml-2">Weight:</span>
                                                <span className="font-mono">{typographyStyles.fontWeight}</span>
                                            </div>
                                            <div className="flex gap-2">
                                                <span className="text-muted-foreground/70">Color:</span>
                                                <span className="font-mono flex items-center gap-1">
                                                    <span
                                                        className="inline-block w-3 h-3 rounded border border-border"
                                                        style={{ backgroundColor: typographyStyles.color }}
                                                    />
                                                    {typographyStyles.color}
                                                </span>
                                            </div>
                                            <div className="flex gap-2">
                                                <span className="text-muted-foreground/70">Line Height:</span>
                                                <span className="font-mono">{typographyStyles.lineHeight}</span>
                                            </div>
                                        </div>
                                    )}
                                    {!typographyStyles && (
                                        <div className="text-xs text-muted-foreground/50 italic">No style data available</div>
                                    )}
                                </div>
                            </label>
                        </div>
                    )}

                    {loading && activeTab !== "code" && activeTab !== "styles" && (
                        <div className="flex items-center justify-center py-6">
                            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                        </div>
                    )}

                    {!loading && activeTab === "console" && (
                        <div className="p-2 space-y-1">
                            {/* Search Input */}
                            <div className="relative mb-2">
                                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                                <input
                                    type="text"
                                    value={consoleSearch}
                                    onChange={(e) => setConsoleSearch(e.target.value)}
                                    placeholder="Filter logs..."
                                    className="w-full pl-7 pr-7 py-1.5 text-xs rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                                />
                                {consoleSearch && (
                                    <button
                                        type="button"
                                        onClick={() => setConsoleSearch("")}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                            {filteredConsole.length === 0 ? (
                                <p className="text-xs text-muted-foreground text-center py-4">
                                    {consoleSearch ? "No matching logs" : "No console logs"}
                                </p>
                            ) : (
                                filteredConsole.map((msg) => (
                                    <label
                                        key={msg.msgid}
                                        className="flex items-start gap-2 p-2 rounded hover:bg-accent/50 cursor-pointer transition-colors"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selectedContext.consoleIds.includes(msg.msgid)}
                                            onChange={() => toggleConsole(msg.msgid)}
                                            className="mt-0.5 rounded border-border"
                                        />
                                        <span className={cn("px-1.5 py-0.5 text-[10px] font-medium rounded flex-shrink-0", getLevelColor(msg.level))}>
                                            {msg.level}
                                        </span>
                                        <span className="text-xs text-foreground/90 flex-1 font-mono break-all line-clamp-2">
                                            {msg.text}
                                        </span>
                                    </label>
                                ))
                            )}
                        </div>
                    )}

                    {!loading && activeTab === "network" && (
                        <div className="p-2 space-y-1">
                            {/* Search Input */}
                            <div className="relative mb-2">
                                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                                <input
                                    type="text"
                                    value={networkSearch}
                                    onChange={(e) => setNetworkSearch(e.target.value)}
                                    placeholder="Filter requests..."
                                    className="w-full pl-7 pr-7 py-1.5 text-xs rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                                />
                                {networkSearch && (
                                    <button
                                        type="button"
                                        onClick={() => setNetworkSearch("")}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                            {filteredNetwork.length === 0 ? (
                                <p className="text-xs text-muted-foreground text-center py-4">
                                    {networkSearch ? "No matching requests" : "No network requests"}
                                </p>
                            ) : (
                                filteredNetwork.map((req) => (
                                    <NetworkRequestItem
                                        key={req.reqid}
                                        request={req}
                                        client={client}
                                        isClientReady={isClientReady}
                                        mode="select"
                                        isSelected={selectedContext.networkIds.includes(req.reqid)}
                                        onSelectionChange={handleNetworkSelectionChange}
                                        onDetailsFetched={handleNetworkDetailsFetched}
                                        cachedDetails={networkDetails[req.reqid]}
                                    />
                                ))
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
