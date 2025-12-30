import React, { useState, useEffect } from "react";
import type { Client } from "@modelcontextprotocol/sdk/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { InspectionQueue, type InspectionItem } from "./InspectionQueue";
import { useContextData } from "../hooks/useContextData";
import { Loader2, RefreshCw, AlertCircle, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "../lib/utils";
import type { NetworkRequest } from "../types";
import { MessageResponse } from "../../src/components/ai-elements/message";

interface ContextDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    inspectionItems: InspectionItem[];
    onRemoveInspection: (id: string) => void;
    client: Client | null;
    isClientReady: boolean;
}

type TabType = "inspections" | "console" | "network";

// Network request item component with expandable details
const NetworkRequestItem: React.FC<{
    request: NetworkRequest;
    client: Client | null;
    isClientReady: boolean;
}> = ({ request, client, isClientReady }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [details, setDetails] = useState<string | null>(null);
    const [loadingDetails, setLoadingDetails] = useState(false);

    const fetchDetails = async () => {
        if (details !== null) return;

        setLoadingDetails(true);
        try {
            // Check if we should use Chrome DevTools or fallback to local storage
            const config = typeof window !== 'undefined' ? (window as any).__DEV_INSPECTOR_CONFIG__ : null;
            // Use Chrome DevTools only when: Chrome is enabled AND running in automated/headless mode
            // In non-automated mode, Chrome DevTools may not be available even if enabled
            const shouldUseChrome = config && !config.disableChrome && config.isAutomated;

            // Try Chrome DevTools only if explicitly enabled
            if (shouldUseChrome && client && isClientReady) {
                try {
                    const result = await client.callTool({
                        name: "chrome_devtools",
                        arguments: {
                            useTool: "chrome_get_network_request",
                            hasDefinitions: ["chrome_get_network_request"],
                            chrome_get_network_request: { reqid: request.reqid },
                        },
                    });
                    const content = (result as { content?: Array<{ text?: string }> })?.content;
                    const text = content?.map((item) => item.text).join("\n") || "No details";
                    setDetails(text);
                    return; // Success, exit early
                } catch (mcpError) {
                    // Chrome DevTools failed, fall through to API method
                    console.log('[ContextDialog] Chrome DevTools failed, using local storage');
                }
            }

            // Fallback: Fetch from local storage API (Chromeless mode or Chrome unavailable)
            const baseUrl = config
                ? (() => {
                    const url = config.baseUrl || (`http://${config.host}:${config.port}${config.base || '/'}`);
                    return url.endsWith('/') ? url.slice(0, -1) : url;
                })()
                : '';

            const response = await fetch(`${baseUrl}/__inspector__/request-details/${request.reqid}`);

            if (response.ok) {
                const text = await response.text();
                setDetails(text);
            } else {
                throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
            }
        } catch (error) {
            setDetails(`Failed to fetch details: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setLoadingDetails(false);
        }
    };

    const handleToggle = () => {
        if (!isExpanded) {
            fetchDetails();
        }
        setIsExpanded(!isExpanded);
    };

    const getMethodColor = (method: string) => {
        switch (method.toUpperCase()) {
            case "GET": return "bg-green-500/20 text-green-600";
            case "POST": return "bg-blue-500/20 text-blue-500";
            case "PUT": return "bg-yellow-500/20 text-yellow-600";
            case "DELETE": return "bg-red-500/20 text-red-500";
            case "PATCH": return "bg-purple-500/20 text-purple-500";
            default: return "bg-muted text-muted-foreground";
        }
    };

    const getStatusColor = (status: string) => {
        // Extract status code from string like "failed - 304" or "success - 200"
        const match = status.match(/\b(\d{3})\b/);
        const code = match ? parseInt(match[1]) : 0;

        if (code >= 200 && code < 300) return "text-green-600";
        if (code >= 300 && code < 400) return "text-yellow-600"; // 3xx is warning/redirect, not error
        if (code >= 400) return "text-red-500";

        if (status.includes("success")) return "text-green-600";
        if (status.includes("failed")) return "text-red-500";
        if (status.includes("pending")) return "text-yellow-600";
        return "text-muted-foreground";
    };

    const renderDetails = () => {
        if (loadingDetails) {
            return (
                <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading...
                </div>
            );
        }

        if (!details) return null;

        let markdownContent = details;
        let sourceMapJson = null;

        try {
            const sourceMapPrefix = "//# sourceMappingURL=data:application/json;base64,";
            const lines = details.split('\n');
            const sourceMapLine = lines.find(l => l.trim().startsWith(sourceMapPrefix));

            if (sourceMapLine) {
                const base64 = sourceMapLine.trim().substring(sourceMapPrefix.length);
                const jsonStr = atob(base64);
                sourceMapJson = JSON.parse(jsonStr);

                // If we have a source map, construct a nice markdown display
                markdownContent = `**Source Map (Decoded):**
\`\`\`json
${JSON.stringify(sourceMapJson, null, 2)}
\`\`\`

**Raw Content:**
\`\`\`
${details}
\`\`\`
`;
            }
        } catch (e) {
            // Ignore parsing errors
        }

        // If content looks like JSON but isn't markdown formatted (doesn't start with #), wrap it in code block
        // However, the MCP tool usually sends markdown-like headers (### Headers)
        // If it doesn't have headers and starts with { or [, it's likely JSON.
        if (!sourceMapJson && !details.includes("###") && (details.trim().startsWith("{") || details.trim().startsWith("["))) {
            markdownContent = `\`\`\`json\n${details}\n\`\`\``;
        }

        return (
            <div className="text-xs text-foreground/90 bg-background/50 p-3 rounded overflow-x-auto max-h-[400px] overflow-y-auto border border-border">
                <MessageResponse>{markdownContent}</MessageResponse>
            </div>
        );
    };

    return (
        <div className="rounded-md bg-muted/50 hover:bg-muted/70 transition-colors overflow-hidden">
            <button
                onClick={handleToggle}
                className="w-full p-3 text-left flex items-start gap-3"
            >
                <span className="mt-0.5 flex-shrink-0">
                    {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    )}
                </span>
                <span className={cn("px-2 py-0.5 text-xs font-medium rounded flex-shrink-0", getMethodColor(request.method))}>
                    {request.method}
                </span>
                <div className="flex-1 min-w-0 overflow-hidden">
                    <div className="text-sm text-foreground font-mono truncate" title={request.url}>
                        {request.url}
                    </div>
                    <div className={cn("text-xs mt-1", getStatusColor(request.status))}>
                        Status: {request.status}
                    </div>
                </div>
            </button>

            {isExpanded && (
                <div className="px-3 pb-3 pl-10">
                    {renderDetails()}
                </div>
            )}
        </div>
    );
};

export const ContextDialog: React.FC<ContextDialogProps> = ({
    open,
    onOpenChange,
    inspectionItems,
    onRemoveInspection,
    client,
    isClientReady,
}) => {
    const [activeTab, setActiveTab] = useState<TabType>("inspections");
    const { consoleMessages, networkRequests, loading, error, refresh } = useContextData(client, isClientReady);

    // Fetch data when dialog opens
    useEffect(() => {
        if (open) {
            refresh();
        }
    }, [open, refresh]);

    const tabs: Array<{ id: TabType; label: string; count?: number }> = [
        { id: "inspections", label: "Inspections", count: inspectionItems.length },
        { id: "console", label: "Console", count: consoleMessages.length },
        { id: "network", label: "Network", count: networkRequests.length },
    ];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="w-[70vw] max-w-[70vw] h-[80vh] max-h-[80vh] flex flex-col"
                onClose={() => onOpenChange(false)}
            >
                <DialogHeader className="flex-shrink-0 pr-8">
                    <div className="flex items-center justify-between gap-4">
                        <DialogTitle>Full Page Context</DialogTitle>
                        <button
                            type="button"
                            onClick={() => refresh()}
                            disabled={loading}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border bg-background hover:bg-accent rounded-md transition-colors disabled:opacity-50"
                            title="Refresh Data"
                        >
                            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
                            <span>Refresh</span>
                        </button>
                    </div>
                </DialogHeader>

                {/* Tabs */}
                <div className="flex gap-1 border-b border-border flex-shrink-0">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={cn(
                                "px-4 py-2 text-sm font-medium transition-colors relative",
                                activeTab === tab.id
                                    ? "text-foreground"
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            {tab.label}
                            {tab.count !== undefined && tab.count > 0 && (
                                <span className="ml-2 px-1.5 py-0.5 text-xs bg-muted rounded-full">
                                    {tab.count}
                                </span>
                            )}
                            {activeTab === tab.id && (
                                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground" />
                            )}
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                <div className="flex-1 overflow-auto min-h-0">
                    {error && (
                        <div className="flex items-center gap-2 p-4 text-sm text-destructive bg-destructive/10 rounded-md m-4">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            <span className="break-all">{error}</span>
                        </div>
                    )}

                    {activeTab === "inspections" && (
                        <div className="h-full overflow-auto">
                            {inspectionItems.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                                    <p className="text-sm">No inspections</p>
                                    <p className="text-xs mt-1">Use ⌥I to inspect elements</p>
                                </div>
                            ) : (
                                <InspectionQueue items={inspectionItems} onRemove={onRemoveInspection} />
                            )}
                        </div>
                    )}

                    {activeTab === "console" && (
                        <div className="p-4 space-y-2 h-full overflow-auto">
                            {loading && (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                                </div>
                            )}
                            {!loading && consoleMessages.length === 0 && (
                                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                                    <p className="text-sm">No console logs</p>
                                </div>
                            )}
                            {!loading &&
                                consoleMessages.map((msg) => (
                                    <div
                                        key={msg.msgid}
                                        className="p-3 rounded-md bg-muted/50 hover:bg-muted transition-colors"
                                    >
                                        <div className="flex items-start gap-2">
                                            <span
                                                className={cn(
                                                    "px-2 py-0.5 text-xs font-medium rounded flex-shrink-0",
                                                    msg.level === "error" && "bg-red-500/20 text-red-500",
                                                    msg.level === "warn" && "bg-yellow-500/20 text-yellow-600",
                                                    msg.level === "info" && "bg-blue-500/20 text-blue-500",
                                                    msg.level === "log" && "bg-muted text-muted-foreground",
                                                    msg.level === "debug" && "bg-purple-500/20 text-purple-500"
                                                )}
                                            >
                                                {msg.level}
                                            </span>
                                            <span className="text-sm text-foreground/90 flex-1 font-mono break-all overflow-hidden">
                                                {msg.text}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                        </div>
                    )}

                    {activeTab === "network" && (
                        <div className="p-4 space-y-2 h-full overflow-auto">
                            {loading && (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                                </div>
                            )}
                            {!loading && networkRequests.length === 0 && (
                                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                                    <p className="text-sm">No network requests</p>
                                </div>
                            )}
                            {!loading &&
                                networkRequests.map((req) => (
                                    <NetworkRequestItem
                                        key={req.reqid}
                                        request={req}
                                        client={client}
                                        isClientReady={isClientReady}
                                    />
                                ))}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};
