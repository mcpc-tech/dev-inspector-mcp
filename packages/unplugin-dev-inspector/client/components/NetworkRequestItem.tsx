import React, { useState, useEffect } from "react";
import type { Client } from "@modelcontextprotocol/sdk/client";
import type { NetworkRequest } from "../types";
import { Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "../lib/utils";

export interface NetworkRequestDetails {
    reqid: number;
    details: string;
}

interface NetworkRequestItemProps {
    /** Network request data */
    request: NetworkRequest;
    /** MCP client for fetching details */
    client: Client | null;
    /** Whether client is ready */
    isClientReady: boolean;
    /** Mode: 'select' shows checkbox, 'view' shows expand only */
    mode?: "select" | "view";
    /** Whether this item is selected (for select mode) */
    isSelected?: boolean;
    /** Called when selection changes (for select mode) */
    onSelectionChange?: (reqid: number, selected: boolean) => void;
    /** Called when details are fetched - parent can cache these */
    onDetailsFetched?: (reqid: number, details: string) => void;
    /** Pre-cached details (to avoid refetching) */
    cachedDetails?: string;
}

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
    const match = status.match(/\b(\d{3})\b/);
    const code = match ? parseInt(match[1]) : 0;

    if (code >= 200 && code < 300) return "text-green-600";
    if (code >= 300 && code < 400) return "text-yellow-600";
    if (code >= 400) return "text-red-500";

    if (status.includes("success")) return "text-green-600";
    if (status.includes("failed")) return "text-red-500";
    if (status.includes("pending")) return "text-yellow-600";
    return "text-muted-foreground";
};

export const NetworkRequestItem: React.FC<NetworkRequestItemProps> = ({
    request,
    client,
    isClientReady,
    mode = "view",
    isSelected = false,
    onSelectionChange,
    onDetailsFetched,
    cachedDetails,
}) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [details, setDetails] = useState<string | null>(cachedDetails ?? null);
    const [loadingDetails, setLoadingDetails] = useState(false);

    // Sync cached details from parent
    useEffect(() => {
        if (cachedDetails && !details) {
            setDetails(cachedDetails);
        }
    }, [cachedDetails, details]);

    const fetchDetails = async () => {
        if (details !== null) return;

        setLoadingDetails(true);
        try {
            // Check if we should use Chrome DevTools or fallback to local storage
            const config = typeof window !== 'undefined' ? (window as any).__DEV_INSPECTOR_CONFIG__ : null;
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
                    onDetailsFetched?.(request.reqid, text);
                    return; // Success, exit early
                } catch (mcpError) {
                    // Chrome DevTools failed, fall through to API method
                    console.log('[NetworkRequestItem] Chrome DevTools failed, using local storage');
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
                onDetailsFetched?.(request.reqid, text);
            } else {
                throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
            }
        } catch (error) {
            const errorText = `Failed to fetch details: ${error instanceof Error ? error.message : String(error)}`;
            setDetails(errorText);
        } finally {
            setLoadingDetails(false);
        }
    };

    const handleToggleExpand = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!isExpanded) {
            fetchDetails();
        }
        setIsExpanded(!isExpanded);
    };

    const handleCheckboxChange = () => {
        if (mode === "select" && onSelectionChange) {
            // When selecting, also fetch details
            if (!isSelected && !details) {
                fetchDetails();
            }
            onSelectionChange(request.reqid, !isSelected);
        }
    };

    return (
        <div className="rounded hover:bg-accent/50 transition-colors">
            <div
                className={cn(
                    "flex items-start gap-2 p-2 cursor-pointer",
                    isExpanded && "border-b border-border/50"
                )}
                onClick={mode === "view" ? handleToggleExpand : handleCheckboxChange}
            >
                {mode === "select" && (
                    <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={handleCheckboxChange}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-0.5 rounded border-border"
                    />
                )}

                <button
                    type="button"
                    onClick={handleToggleExpand}
                    className="flex-shrink-0 text-muted-foreground hover:text-foreground"
                >
                    {loadingDetails ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                    ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                    )}
                </button>

                <span className={cn("px-1.5 py-0.5 text-[10px] font-medium rounded flex-shrink-0", getMethodColor(request.method))}>
                    {request.method}
                </span>

                <span className="text-xs text-foreground/90 flex-1 font-mono truncate" title={request.url}>
                    {request.url}
                </span>

                <span className={cn("text-[10px] font-medium flex-shrink-0", getStatusColor(request.status))}>
                    {request.status}
                </span>
            </div>

            {/* Expanded Details */}
            {isExpanded && (
                <div className="p-2 bg-accent/30">
                    {loadingDetails ? (
                        <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Loading...
                        </div>
                    ) : details ? (
                        <pre className="text-[10px] text-muted-foreground font-mono whitespace-pre-wrap break-all max-h-[150px] overflow-auto">
                            {details}
                        </pre>
                    ) : null}
                </div>
            )}
        </div>
    );
};
