import React, { useState, useEffect } from "react";
import type { Client } from "@modelcontextprotocol/sdk/client";
import type { InspectedElement } from "../types";
import { useContextData } from "../hooks/useContextData";
import { Loader2, RefreshCw, ChevronDown, ChevronRight, Code, Type, Search, X } from "lucide-react";
import { cn } from "../lib/utils";
import type { ConsoleMessage, NetworkRequest } from "../types";
import { NetworkRequestItem } from "./NetworkRequestItem";

export interface SelectedContext {
    /** Include element source info */
    includeElement: boolean;
    /** Include computed styles */
    includeStyles: boolean;
    /** Include screenshot */
    includeScreenshot: boolean;
    consoleIds: number[];
    networkIds: number[];
    /** Actual console message data (enriched at submission time) */
    consoleMessages?: ConsoleMessage[];
    /** Actual network request data with details (enriched at submission time) */
    networkRequests?: Array<NetworkRequest & { details?: string | null }>;
    /** Screenshot data URL (captured at inspection time) */
    screenshot?: string;
}

interface ContextPickerProps {
    client: Client | null;
    isClientReady: boolean;
    /** Source info of the inspected element */
    sourceInfo?: InspectedElement;
    selectedContext: SelectedContext;
    onSelectionChange: (context: SelectedContext) => void;
    /** Screenshot file path (if available) */
    screenshot?: string;
    /** Callback when data is loaded, provides console/network data for parent */
    onDataReady?: (data: {
        consoleMessages: ConsoleMessage[];
        networkRequests: NetworkRequest[];
        networkDetails: Record<number, string>;
    }) => void;
}

type TabType = "code" | "styles" | "screenshot" | "console" | "network";

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
}) => {
    const [isExpanded, setIsExpanded] = useState(true); // Default expanded
    const [activeTab, setActiveTab] = useState<TabType>("code");
    const [consoleSearch, setConsoleSearch] = useState("");
    const [networkSearch, setNetworkSearch] = useState("");
    const [networkDetails, setNetworkDetails] = useState<Record<number, string>>({});
    const { consoleMessages, networkRequests, loading, error, refresh } = useContextData(client, isClientReady);

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
    useEffect(() => {
        if (isExpanded && isClientReady) {
            refresh();
        }
    }, [isExpanded, isClientReady, refresh]);

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
        (selectedContext.includeScreenshot ? 1 : 0) +
        selectedContext.consoleIds.length +
        selectedContext.networkIds.length;

    const toggleElement = () => {
        onSelectionChange({ ...selectedContext, includeElement: !selectedContext.includeElement });
    };

    const toggleStyles = () => {
        onSelectionChange({ ...selectedContext, includeStyles: !selectedContext.includeStyles });
    };

    const toggleScreenshot = () => {
        onSelectionChange({ ...selectedContext, includeScreenshot: !selectedContext.includeScreenshot });
    };

    const toggleConsole = (msgid: number) => {
        const ids = selectedContext.consoleIds.includes(msgid)
            ? selectedContext.consoleIds.filter((id) => id !== msgid)
            : [...selectedContext.consoleIds, msgid];
        onSelectionChange({ ...selectedContext, consoleIds: ids });
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
        { id: "screenshot", label: "Visual", selectedCount: selectedContext.includeScreenshot ? 1 : 0 },
        { id: "console", label: "Console", totalCount: consoleMessages.length, selectedCount: selectedContext.consoleIds.length },
        { id: "network", label: "Network", totalCount: networkRequests.length, selectedCount: selectedContext.networkIds.length },
    ];

    return (
        <div className="border border-border rounded-md overflow-hidden">
            {/* Collapse Header */}
            <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between px-3 py-2 text-sm text-muted-foreground hover:bg-accent/50 transition-colors"
            >
                <div className="flex items-center gap-2">
                    {isExpanded ? (
                        <ChevronDown className="w-4 h-4" />
                    ) : (
                        <ChevronRight className="w-4 h-4" />
                    )}
                    <span>Context</span>
                    {totalSelected > 0 && (
                        <span className="px-1.5 py-0.5 text-xs bg-primary text-primary-foreground rounded-full">
                            {totalSelected}
                        </span>
                    )}
                </div>
                {isExpanded && (
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
                )}
            </button>

            {/* Expanded Content */}
            {isExpanded && (
                <div className="border-t border-border">
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
                    <div className="max-h-[200px] overflow-auto">
                        {error && (
                            <div className="p-2 text-xs text-destructive">{error}</div>
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
                                            <div className="text-[10px] text-muted-foreground/70 mb-2">Note: Some editors may only paste the image. Use Ctrl+Shift+V or right-click to paste as plain text if needed.</div>
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

                        {loading && activeTab !== "code" && activeTab !== "styles" && activeTab !== "screenshot" && (
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
            )}
        </div>
    );
};
