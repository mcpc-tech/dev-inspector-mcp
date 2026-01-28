import { useEffect, useState } from "react";
import { type McpUiHostContext, applyDocumentTheme, applyHostFonts, applyHostStyleVariables } from "@modelcontextprotocol/ext-apps";
import { McpAppClient, PostMessageTransport } from "../lib/McpAppClient";

export const ContextSelectorApp = () => {
    const [hostContext, setHostContext] = useState<McpUiHostContext | undefined>();

    // Apply host styles
    useEffect(() => {
        if (hostContext?.theme) {
            applyDocumentTheme(hostContext.theme);
        }
        if (hostContext?.styles?.variables) {
            applyHostStyleVariables(hostContext.styles.variables);
        }
        if (hostContext?.styles?.css?.fonts) {
            applyHostFonts(hostContext.styles.css.fonts);
        }
    }, [hostContext]);

    // Connect
    useEffect(() => {
        const mcpClient = new McpAppClient({ name: "Context Selector", version: "1.0.0" });
        const transport = new PostMessageTransport(window.parent);

        mcpClient.onHostContextChanged = (params) => {
            console.log("Host context changed:", params);
            setHostContext(prev => ({ ...prev, ...params }));
        };

        mcpClient.connect(transport)
            .then(() => {
                console.log("MCP App connected");
                setHostContext(mcpClient.getHostContext());
            })
            .catch((err) => {
                console.error("Failed to connect MCP App:", err);
            });

        return () => {
            mcpClient.close().catch(console.error);
        };
    }, []);

    return (
        <div className="flex items-center justify-center h-screen bg-background text-foreground">
            <h1 className="text-4xl font-bold">Hello World</h1>
        </div>
    );
};
