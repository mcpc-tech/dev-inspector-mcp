/**
 * Standalone Sidebar Entry Point
 * 
 * This is an independent UI served at /__inspector__/sidebar
 * that connects to the same MCP server as the embedded inspector.
 */

import { useState, useEffect, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { SidebarApp } from "./components/SidebarApp";
import { useMcp } from "./hooks/useMcp";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { getDevServerBaseUrl } from "./utils/config-loader";
import { InspectorThemeProvider } from "./context/ThemeContext";
import type { Agent } from "./constants/types";
import type { InspectionItem } from "./components/InspectionQueue";
import "./styles.css";

function SidebarContainer() {
    const [, setSelectedAgent] = useState<string>("Claude Code");
    const [inspectionQueue, setInspectionQueue] = useState<InspectionItem[]>([]);

    // MCP connection - useMcp returns { client, isClientReady }
    const { client: mcpClient, isClientReady } = useMcp();

    // Connection status derived from MCP state
    const connectionStatus = isClientReady ? "connected" : "connecting";

    // Chat configuration with AI SDK - matching inspector.tsx pattern
    const { messages, sendMessage, status, stop } = useChat({
        transport: new DefaultChatTransport({
            api: `${getDevServerBaseUrl()}/api/acp/chat`,
        }),
    });

    // Match handleAgentSubmit signature from inspector.tsx
    const handleAgentSubmit = useCallback(
        (query: string, agent: Agent, sessionId?: string) => {
            if (!query.trim()) return;

            sendMessage(
                { text: query },
                {
                    body: {
                        agent,
                        envVars: {},
                        sessionId,
                    },
                }
            );
        },
        [sendMessage]
    );

    const handleCancel = useCallback(() => {
        stop();
    }, [stop]);

    const handleRemoveInspection = useCallback((id: string) => {
        setInspectionQueue((items) => items.filter((item) => item.id !== id));
    }, []);

    // Listen for inspection events from the embedded inspector
    useEffect(() => {
        const handleInspectionAdded = (event: CustomEvent) => {
            const { item } = event.detail;
            if (item) {
                setInspectionQueue((prev) => [...prev, item]);
            }
        };

        // Cross-window messaging for inspection items
        const handleMessage = (event: MessageEvent) => {
            if (event.data?.type === "dev-inspector:inspection-added") {
                const { item } = event.data;
                if (item) {
                    setInspectionQueue((prev) => [...prev, item]);
                }
            }
        };

        window.addEventListener("dev-inspector:inspection-added", handleInspectionAdded as EventListener);
        window.addEventListener("message", handleMessage);

        return () => {
            window.removeEventListener("dev-inspector:inspection-added", handleInspectionAdded as EventListener);
            window.removeEventListener("message", handleMessage);
        };
    }, []);

    const isAgentWorking = status === "streaming" || status === "submitted";

    return (
        <SidebarApp
            onSubmitAgent={handleAgentSubmit}
            onCancel={handleCancel}
            isAgentWorking={isAgentWorking}
            messages={messages}
            status={status}
            inspectionCount={inspectionQueue.length}
            inspectionItems={inspectionQueue}
            onRemoveInspection={handleRemoveInspection}
            toolsReady={isClientReady}
            mcpClient={mcpClient}
            onAgentChange={setSelectedAgent}
            connectionStatus={connectionStatus}
        />
    );
}

// Mount the sidebar app
function mount() {
    const container = document.getElementById("sidebar-root");
    if (!container) {
        console.error("[Sidebar] Root element #sidebar-root not found");
        return;
    }

    const root = createRoot(container);
    root.render(
        <InspectorThemeProvider>
            <SidebarContainer />
        </InspectorThemeProvider>
    );
}

// Auto-mount on DOM ready
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
} else {
    mount();
}
