import React, { useState, useEffect } from "react";
import type { Client } from "@modelcontextprotocol/sdk/client";
import type { InspectedElement } from "../types";
import { useContextData } from "../hooks/useContextData";
import { usePageInfo } from "../hooks/usePageInfo";
import { Loader2, RefreshCw, Code, Type, Search, X, Sparkles, Globe, MessageSquare } from "lucide-react";
import { cn } from "../lib/utils";
import type { ConsoleMessage, NetworkRequest, StdioMessage } from "../types";
import { NetworkRequestItem } from "./NetworkRequestItem";
import { useChat, type UIMessage } from "@ai-sdk/react";
import { getDevServerBaseUrl } from "../utils/config-loader";
import { DefaultChatTransport } from "ai";
import { DEFAULT_AGENT, AVAILABLE_AGENTS } from "../constants/agents";
import { extractDisplayText, extractLatestToolName } from "../utils/messageProcessor";
import { normalizeToolName } from "../lib/messageRenderer";

// Maximum number of recent items to include in AI context analysis
const MAX_RECENT_ITEMS = 50;

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
    /** Include screenshot */
    includeScreenshot: boolean;
    /** Include page information */
    includePageInfo: boolean;
    consoleIds: number[];
    networkIds: number[];
    stdioIds: number[];
    /** Selected related element indices (for region selection) */
    relatedElementIds: number[];
    /** Actual console message data (enriched at submission time) */
    consoleMessages?: ConsoleMessage[];
    /** Actual network request data with details (enriched at submission time) */
    networkRequests?: Array<NetworkRequest & { details?: string | null }>;
    /** Actual stdio message data (enriched at submission time) */
    stdioMessages?: StdioMessage[];
    /** Screenshot data URL (captured at inspection time) */
    screenshot?: string;
    /** AI reasoning for the selection */
    reasoning?: string;
    /** User notes for specific elements (key is element index) */
    elementNotes: Record<number, string>;
}

interface ContextPickerProps {
    client: Client | null;
    isClientReady: boolean;
    /** Source info of the inspected element */
    sourceInfo?: InspectedElement;
    selectedContext: SelectedContext;
    /** Screenshot file path (if available) */
    screenshot?: string;
    onSelectionChange: (context: SelectedContext | ((prev: SelectedContext) => SelectedContext)) => void;
    /** Callback when data is loaded, provides console/network data for parent */
    onDataReady?: (data: {
        consoleMessages: ConsoleMessage[];
        networkRequests: NetworkRequest[];
        stdioMessages: StdioMessage[];
        networkDetails: Record<number, string>;
    }) => void;
    /** Whether the inspection is automated */
    isAutomated?: boolean;
    /** User input to guide the context selection */
    userInput?: string;
    /** Currently selected agent name */
    selectedAgent?: string;
}

interface ContextSelectorArgs {
    consoleIds?: number[];
    networkIds?: number[];
    stdioIds?: number[];
    includeElement?: boolean;
    includeStyles?: boolean;
    reasoning?: string;
}

type TabType = "code" | "styles" | "screenshot" | "page" | "console" | "network" | "stdio";

interface TabConfig {
    id: TabType;
    label: string;
    selectedCount?: number;
    totalCount?: number;
}

const TabButton: React.FC<{
    tab: TabConfig;
    isActive: boolean;
    onClick: () => void;
}> = ({ tab, isActive, onClick }) => (
    <button
        type="button"
        onClick={onClick}
        className={cn(
            "px-3 py-1.5 text-xs font-medium transition-colors relative",
            isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
        )}
    >
        {tab.label}
        {tab.totalCount !== undefined && tab.totalCount > 0 && (
            <span className="ml-1 text-xs text-muted-foreground">({tab.totalCount})</span>
        )}
        {tab.selectedCount !== undefined && tab.selectedCount > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-medium bg-primary text-primary-foreground rounded-full">
                {tab.selectedCount}
            </span>
        )}
        {isActive && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" />}
    </button>
);

export const ContextPicker: React.FC<ContextPickerProps> = ({
    client,
    isClientReady,
    sourceInfo,
    selectedContext,
    onSelectionChange,
    screenshot,
    onDataReady,
    userInput,
    selectedAgent = DEFAULT_AGENT
}) => {
    const [activeTab, setActiveTab] = useState<TabType>("code");
    const [consoleSearch, setConsoleSearch] = useState("");
    const [networkSearch, setNetworkSearch] = useState("");
    const [networkDetails, setNetworkDetails] = useState<Record<number, string>>({});
    const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
    const pageInfo = usePageInfo();
    // Always fetch context data regardless of isAutomated - we have fallback logic for Chrome unavailable scenarios
    const { consoleMessages, networkRequests, stdioMessages, loading, error, refresh } = useContextData(client, isClientReady, true);

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
        if (onDataReady && (consoleMessages.length > 0 || networkRequests.length > 0 || stdioMessages.length > 0)) {
            onDataReady({ consoleMessages, networkRequests, stdioMessages, networkDetails });
        }
    }, [consoleMessages, networkRequests, stdioMessages, networkDetails, onDataReady]);

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
        (selectedContext.includeScreenshot ? 1 : 0) +
        (selectedContext.includePageInfo ? 1 : 0) +
        selectedContext.consoleIds.length +
        selectedContext.networkIds.length +
        selectedContext.stdioIds.length +
        selectedContext.relatedElementIds.length;

    const toggleElement = () => {
        onSelectionChange({ ...selectedContext, includeElement: !selectedContext.includeElement });
    };

    const toggleStyles = () => {
        onSelectionChange({ ...selectedContext, includeStyles: !selectedContext.includeStyles });
    };

    const toggleScreenshot = () => {
        onSelectionChange({ ...selectedContext, includeScreenshot: !selectedContext.includeScreenshot });
    };

    const togglePageInfo = () => {
        onSelectionChange({ ...selectedContext, includePageInfo: !selectedContext.includePageInfo });
    };

    const toggleConsole = (msgid: number) => {
        const ids = selectedContext.consoleIds.includes(msgid)
            ? selectedContext.consoleIds.filter((id) => id !== msgid)
            : [...selectedContext.consoleIds, msgid];
        onSelectionChange({ ...selectedContext, consoleIds: ids });
    };

    const toggleStdio = (id: number) => {
        const ids = selectedContext.stdioIds.includes(id)
            ? selectedContext.stdioIds.filter((sid) => sid !== id)
            : [...selectedContext.stdioIds, id];
        onSelectionChange({ ...selectedContext, stdioIds: ids });
    };

    const toggleRelatedElement = (idx: number) => {
        const ids = selectedContext.relatedElementIds.includes(idx)
            ? selectedContext.relatedElementIds.filter((id) => id !== idx)
            : [...selectedContext.relatedElementIds, idx];
        onSelectionChange({ ...selectedContext, relatedElementIds: ids });
    };

    // Chat hook for context inference
    const { messages, status, sendMessage, setMessages } = useChat({
        transport: new DefaultChatTransport({
            api: `${getDevServerBaseUrl()}/api/acp/chat`,
        }),
    });

    const isProcessing = status === 'submitted' || status === 'streaming';

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
                // Defensive parsing: despite type annotation, args might be a string in some transport scenarios
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
                    stdioIds: finalArgs?.stdioIds || [],
                    includeElement: finalArgs?.includeElement ?? true, // Default to true if not specified
                    includeStyles: finalArgs?.includeStyles ?? false, // Default to false if not specified
                    reasoning: finalArgs?.reasoning,
                    elementNotes: selectedContext.elementNotes
                }));
            } catch (e) {
                console.error("Failed to process context inference args", e);
            }
        }
    }, [messages, status, onSelectionChange]);

    const handleSmartSelect = async () => {
        if (!sourceInfo || isProcessing) return;
        setMessages([]);

        // Helper to truncate text
        const truncate = (text: string, maxLength: number) =>
            text.length > maxLength ? text.slice(0, maxLength) + "..." : text;

        // Process recent logs (truncated and limited count)
        const MAX_MSG_LEN = 200;

        const recentConsole = consoleMessages
            .slice(-MAX_RECENT_ITEMS)
            .map(m => `[${m.msgid}] ${m.level}: ${truncate(m.text, MAX_MSG_LEN)}`)
            .join('\n');

        // Network: Only method, URL, status (no bodies/headers)
        const recentNetwork = networkRequests
            .slice(-MAX_RECENT_ITEMS)
            .map(r => `[${r.reqid}] ${r.method} ${r.url} (${r.status})`)
            .join('\n');

        // Terminal: Truncated data
        const recentStdio = stdioMessages
            .slice(-MAX_RECENT_ITEMS)
            .map(m => `[${m.stdioid}] ${m.stream}: ${truncate(m.data, MAX_MSG_LEN)}`)
            .join('\n');

        const prompt = `
I am inspecting the following element:
${userInput ? `Context/Interests: ${userInput}` : ''}
Tag: ${sourceInfo.elementInfo?.tagName}
File: ${sourceInfo.file}:${sourceInfo.line}
Component: ${sourceInfo.component}

Available Console Logs (Recent ${MAX_RECENT_ITEMS}):
${recentConsole || "None"}

Available Network Requests (Recent ${MAX_RECENT_ITEMS}):
${recentNetwork || "None"}

Available Terminal Logs (Recent ${MAX_RECENT_ITEMS}):
${recentStdio || "None"}

IMPORTANT: For this task, you MUST call the "context_selector" tool to return your selection. Do NOT use inspector tools like list_inspections, capture_element_context, update_inspection_status, or execute_page_script - the context is already provided above. You may read files if needed to understand the context better. Even if you select nothing, still call context_selector with empty arrays. Do not reply with text only. Note: You can ignore logs from dev-inspector itself.
`;
        const currentAgent = AVAILABLE_AGENTS.find(a => a.name === selectedAgent) || AVAILABLE_AGENTS[0];
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

    // Tab configuration (KISS: data-driven rendering)
    const tabs: TabConfig[] = [
        { id: "code", label: "Code", selectedCount: selectedContext.includeElement ? 1 : 0 },
        { id: "styles", label: "Styles", selectedCount: selectedContext.includeStyles ? 1 : 0 },
        { id: "page", label: "Page", selectedCount: selectedContext.includePageInfo ? 1 : 0 },
        { id: "screenshot", label: "Visual", selectedCount: selectedContext.includeScreenshot ? 1 : 0 },
        { id: "console", label: "Console", totalCount: consoleMessages.length, selectedCount: selectedContext.consoleIds.length },
        { id: "network", label: "Network", totalCount: networkRequests.length, selectedCount: selectedContext.networkIds.length },
        { id: "stdio", label: "Terminal", totalCount: stdioMessages.length, selectedCount: selectedContext.stdioIds.length },
    ];

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
                        disabled={loading || isProcessing}
                        className={cn(
                            "flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded transition-colors border shadow-sm",
                            isProcessing
                                ? "bg-blue-100 text-blue-700 border-blue-200"
                                : "bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100 hover:text-blue-700 hover:border-blue-300"
                        )}
                        title="Let AI analyze logs and network to select relevant context"
                    >
                        <Sparkles className={cn("w-3.5 h-3.5", isProcessing && "animate-pulse")} />
                        <span>{isProcessing ? "Analyzing..." : "Smart Select"}</span>
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
                {/* Tabs - KISS: data-driven rendering */}
                <div className="flex gap-1 border-b border-border px-2 pt-1">
                    {tabs.map(tab => (
                        <TabButton
                            key={tab.id}
                            tab={tab}
                            isActive={activeTab === tab.id}
                            onClick={() => setActiveTab(tab.id)}
                        />
                    ))}
                </div>

                {/* Tab Content */}
                <div className={`max-h-[200px] overflow-auto relative ${isProcessing ? 'min-h-[150px]' : ''}`}>
                    {isProcessing && (() => {
                        const lastMsg = messages[messages.length - 1];
                        const displayText = lastMsg?.role === 'assistant' ? extractDisplayText(lastMsg) : '';
                        const toolName = lastMsg?.role === 'assistant' ? extractLatestToolName(lastMsg) : null;

                        return (
                            <div className="absolute inset-0 z-10 bg-background/95 backdrop-blur-sm flex flex-col items-center justify-center p-4 min-h-[120px]">
                                <Sparkles className="w-6 h-6 text-blue-500 animate-pulse mb-3" />
                                <span className="text-sm font-medium text-foreground text-center max-w-full truncate px-2">
                                    {toolName
                                        ? `Running: ${normalizeToolName(toolName)}`
                                        : 'Analyzing context...'}
                                </span>
                                {displayText && (
                                    <p className="text-xs text-muted-foreground leading-relaxed text-center mt-2 line-clamp-2 max-w-[280px]">
                                        {displayText}
                                    </p>
                                )}
                            </div>
                        );
                    })()}
                    {error && (activeTab === "console" || activeTab === "network") && (
                        <div className="p-2 text-xs text-destructive">{error}</div>
                    )}

                    {/* Reasoning Display */}
                    {selectedContext.reasoning && !isProcessing && (
                        <div className="bg-blue-50/50 p-2 border-b border-border">
                            <div className="flex items-start gap-2">
                                <Sparkles className="w-3.5 h-3.5 text-blue-500 mt-0.5 flex-shrink-0" />
                                <p className="text-xs text-muted-foreground leading-relaxed italic">
                                    {selectedContext.reasoning}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Code Tab - Unified Element Display */}
                    {activeTab === "code" && (
                        <div className="p-2 space-y-1">
                            {(() => {
                                // Unified: treat single element as a list of one
                                const elements = sourceInfo?.relatedElements && sourceInfo.relatedElements.length > 0
                                    ? sourceInfo.relatedElements
                                    : sourceInfo ? [sourceInfo] : [];

                                const isRegionSelection = sourceInfo?.relatedElements && sourceInfo.relatedElements.length > 0;

                                // Group elements by file
                                const grouped = elements.reduce((acc, el, idx) => {
                                    const file = el.file || 'unknown';
                                    if (!acc[file]) acc[file] = [];
                                    acc[file].push({ el, idx });
                                    return acc;
                                }, {} as Record<string, Array<{ el: InspectedElement, idx: number }>>);

                                return (
                                    <div>
                                        <div className="flex items-center gap-1.5 px-2 mb-2">
                                            <Code className={isRegionSelection
                                                ? "w-3.5 h-3.5 text-muted-foreground"
                                                : "w-4 h-4 text-blue-500"
                                            } />
                                            <div className="text-xs font-medium text-muted-foreground">
                                                {isRegionSelection ? 'Related Elements' : 'Source Location'}
                                            </div>
                                            {isRegionSelection && (
                                                <span className="ml-auto px-1.5 py-0.5 text-[10px] bg-muted text-muted-foreground rounded-full">
                                                    {elements.length}
                                                </span>
                                            )}
                                        </div>
                                        <div className="space-y-2 max-h-60 overflow-y-auto">
                                            {Object.entries(grouped).map(([file, fileElements]) => (
                                                <div key={file} className="space-y-0.5">
                                                    {/* File header - always show for consistency */}
                                                    <div className="px-2 py-1 text-[11px] font-medium text-muted-foreground/70 bg-muted/30 rounded sticky top-0">
                                                        {file} ({fileElements.length})
                                                    </div>
                                                    {/* Elements */}
                                                    {fileElements.map(({ el, idx }) => (
                                                        <div key={idx} className="group relative">
                                                            <label
                                                                className="flex items-start gap-2 pl-4 pr-8 py-1.5 rounded hover:bg-accent/50 cursor-pointer transition-colors relative"
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isRegionSelection
                                                                        ? selectedContext.relatedElementIds.includes(idx)
                                                                        : selectedContext.includeElement
                                                                    }
                                                                    onChange={() => isRegionSelection
                                                                        ? toggleRelatedElement(idx)
                                                                        : toggleElement()
                                                                    }
                                                                    className="mt-0.5 rounded border-border"
                                                                />
                                                                <div className="flex-1 min-w-0 text-xs font-mono">
                                                                    <div className="flex items-center gap-1.5">
                                                                        <span className="text-foreground/80 font-medium">{el.component}</span>
                                                                        <span className="text-muted-foreground/50">•</span>
                                                                        <span className="text-muted-foreground">{el.line}:{el.column}</span>
                                                                    </div>

                                                                    {/* Additional identifying info */}
                                                                    {el.elementInfo && (
                                                                        <div className="text-[10px] text-muted-foreground/60 mt-0.5 space-x-2">
                                                                            {typeof el.elementInfo.className === 'string' && el.elementInfo.className && (
                                                                                <span>.{el.elementInfo.className.split(' ')[0]}</span>
                                                                            )}
                                                                            {el.elementInfo.id && (
                                                                                <span>#{el.elementInfo.id}</span>
                                                                            )}
                                                                            {el.elementInfo.textContent && (
                                                                                <span className="italic">"{el.elementInfo.textContent.trim().slice(0, 20)}{el.elementInfo.textContent.length > 20 ? '...' : ''}"</span>
                                                                            )}
                                                                        </div>
                                                                    )}

                                                                    {/* Note Display */}
                                                                    {selectedContext.elementNotes[idx] && (
                                                                        <div className="mt-1.5 text-[11px] text-yellow-600 dark:text-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 px-1.5 py-0.5 rounded border border-yellow-200 dark:border-yellow-900/40 flex items-start gap-1">
                                                                            <MessageSquare className="w-3 h-3 mt-0.5 flex-shrink-0" />
                                                                            <span className="break-words">{selectedContext.elementNotes[idx]}</span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </label>

                                                            {/* Add/Edit Note Button - Visible on hover or when has note */}
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    e.preventDefault();
                                                                    setEditingNoteId(idx);
                                                                }}
                                                                className={cn(
                                                                    "absolute right-1 top-1.5 p-1 rounded transition-colors",
                                                                    selectedContext.elementNotes[idx]
                                                                        ? "text-yellow-600 hover:bg-yellow-100 opacity-100"
                                                                        : "text-muted-foreground/40 hover:text-foreground hover:bg-accent opacity-0 group-hover:opacity-100"
                                                                )}
                                                                title="Add note to element"
                                                            >
                                                                <MessageSquare className="w-3.5 h-3.5" />
                                                            </button>

                                                            {/* Inline Note Editor */}
                                                            {editingNoteId === idx && (
                                                                <div className="px-4 py-2 bg-muted/30 border-t border-b border-border">
                                                                    <div className="flex gap-2">
                                                                        <input
                                                                            type="text"
                                                                            autoFocus
                                                                            placeholder="Describe issue with this element..."
                                                                            className="flex-1 text-xs bg-background border border-input rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
                                                                            defaultValue={selectedContext.elementNotes[idx] || ""}
                                                                            onKeyDown={(e) => {
                                                                                if (e.key === "Enter") {
                                                                                    e.preventDefault();
                                                                                    const val = e.currentTarget.value.trim();
                                                                                    onSelectionChange(prev => {
                                                                                        const newNotes = { ...prev.elementNotes };
                                                                                        if (val) {
                                                                                            newNotes[idx] = val;
                                                                                        } else {
                                                                                            delete newNotes[idx];
                                                                                        }
                                                                                        return {
                                                                                            ...prev,
                                                                                            elementNotes: newNotes
                                                                                        };
                                                                                    });
                                                                                    setEditingNoteId(null);
                                                                                } else if (e.key === "Escape") {
                                                                                    setEditingNoteId(null);
                                                                                }
                                                                            }}
                                                                            onBlur={(e) => {
                                                                                const val = e.currentTarget.value.trim();
                                                                                if (val !== (selectedContext.elementNotes[idx] || "")) {
                                                                                    onSelectionChange(prev => {
                                                                                        const newNotes = { ...prev.elementNotes };
                                                                                        if (val) {
                                                                                            newNotes[idx] = val;
                                                                                        } else {
                                                                                            delete newNotes[idx];
                                                                                        }
                                                                                        return {
                                                                                            ...prev,
                                                                                            elementNotes: newNotes
                                                                                        };
                                                                                    });
                                                                                }
                                                                                setEditingNoteId(null);
                                                                            }}
                                                                        />
                                                                        <button
                                                                            onClick={() => setEditingNoteId(null)}
                                                                            className="text-muted-foreground hover:text-foreground"
                                                                        >
                                                                            <X className="w-3.5 h-3.5" />
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })()}
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

                    {/* Screenshot Tab */}
                    {activeTab === "screenshot" && (
                        <div className="p-2 space-y-1">
                            {screenshot ? (
                                <label className="flex items-start gap-2 p-2 rounded hover:bg-accent/50 cursor-pointer transition-colors">
                                    <input
                                        type="checkbox"
                                        checked={selectedContext.includeScreenshot}
                                        onChange={toggleScreenshot}
                                        className="mt-0.5 rounded border-border"
                                    />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-xs font-medium text-foreground mb-1">Element Visual</div>
                                        <div className="text-[10px] text-muted-foreground/70 mb-2">Note: Copy & Go only copies text (IDEs don't support mixed text/image paste). To include the image, please right-click and copy it manually.</div>
                                        <div className="rounded border border-border overflow-hidden bg-muted/30">
                                            <img
                                                src={screenshot}
                                                alt="Element Visual"
                                                className="w-full h-auto max-h-[150px] object-contain"
                                            />
                                        </div>
                                    </div>
                                </label>
                            ) : (
                                <p className="text-xs text-muted-foreground text-center py-4">
                                    No visual available
                                </p>
                            )}
                        </div>
                    )}

                    {/* Page Tab */}
                    {activeTab === "page" && (
                        <div className="p-2 space-y-1">
                            {pageInfo ? (
                                <label className="flex items-start gap-2 p-2 rounded hover:bg-accent/50 cursor-pointer transition-colors">
                                    <input
                                        type="checkbox"
                                        checked={selectedContext.includePageInfo}
                                        onChange={togglePageInfo}
                                        className="mt-0.5 rounded border-border"
                                    />
                                    <Globe className="w-4 h-4 text-green-500 flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-xs font-medium text-foreground mb-1">Page Information</div>
                                        <div className="text-xs text-muted-foreground space-y-1">
                                            <div className="flex gap-2">
                                                <span className="text-muted-foreground/70">URL:</span>
                                                <span className="font-mono truncate">{pageInfo.url}</span>
                                            </div>
                                            <div className="flex gap-2">
                                                <span className="text-muted-foreground/70">Title:</span>
                                                <span className="truncate">{pageInfo.title}</span>
                                            </div>
                                            <div className="flex gap-2">
                                                <span className="text-muted-foreground/70">Viewport:</span>
                                                <span className="font-mono">{pageInfo.viewport.width} × {pageInfo.viewport.height}</span>
                                            </div>
                                            <div className="flex gap-2">
                                                <span className="text-muted-foreground/70">Language:</span>
                                                <span className="font-mono">{pageInfo.language}</span>
                                            </div>
                                        </div>
                                    </div>
                                </label>
                            ) : (
                                <p className="text-xs text-muted-foreground text-center py-4">
                                    Loading page info...
                                </p>
                            )}
                        </div>
                    )}

                    {loading && activeTab !== "code" && activeTab !== "styles" && activeTab !== "screenshot" && activeTab !== "page" && (
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

                    {!loading && activeTab === "stdio" && (
                        <div className="p-2 space-y-1">
                            {stdioMessages.length === 0 ? (
                                <p className="text-xs text-muted-foreground text-center py-4">
                                    No terminal logs
                                </p>
                            ) : (
                                stdioMessages.map((msg) => (
                                    <label
                                        key={msg.stdioid}
                                        className="flex items-start gap-2 p-2 rounded hover:bg-accent/50 cursor-pointer transition-colors"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selectedContext.stdioIds.includes(msg.stdioid)}
                                            onChange={() => toggleStdio(msg.stdioid)}
                                            className="mt-0.5 rounded border-border"
                                        />
                                        <span className={cn(
                                            "px-1.5 py-0.5 text-[10px] font-medium rounded flex-shrink-0 border",
                                            msg.stream === "stderr"
                                                ? "bg-red-500/10 text-red-500 border-red-500/20"
                                                : "bg-zinc-500/10 text-zinc-500 border-zinc-500/20"
                                        )}>
                                            {msg.stream}
                                        </span>
                                        <span className="text-xs text-foreground/90 flex-1 font-mono break-all whitespace-pre-wrap">
                                            {msg.data}
                                        </span>
                                    </label>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
