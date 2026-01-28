
import { Protocol } from "@modelcontextprotocol/sdk/shared/protocol.js";
import { JSONRPCMessageSchema } from "@modelcontextprotocol/sdk/types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { z } from "zod";

// --- PostMessageTransport ---
export class PostMessageTransport implements Transport {
    private _onclose?: () => void;
    private _onerror?: (error: Error) => void;
    private _onmessage?: (message: any) => void;
    private _boundMessageListener: (event: MessageEvent) => void;

    constructor(private target: Window = window.parent, private source?: Window) {
        this._boundMessageListener = this.messageListener.bind(this);
    }

    async start(): Promise<void> {
        window.addEventListener("message", this._boundMessageListener);
    }

    async close(): Promise<void> {
        window.removeEventListener("message", this._boundMessageListener);
        this._onclose?.();
    }

    async send(message: any): Promise<void> {
        console.debug("PostMessageTransport sending:", message);
        this.target.postMessage(message, "*");
    }

    private messageListener(event: MessageEvent) {
        if (this.source && event.source !== this.source) {
            return;
        }

        // Basic validation/parsing
        try {
            // In MCP, messages are JSON objects.
            // Zod validation happen in the Protocol layer, but we can check basic structure here
            const parsed = JSONRPCMessageSchema.safeParse(event.data);
            if (parsed.success) {
                console.debug("PostMessageTransport received:", parsed.data);
                this._onmessage?.(parsed.data);
            } else {
                // Ignore non-JSONRPC messages (could be from other libs)
                // or log warning if sure it should be ours
            }
        } catch (err) {
            console.error("Error parsing message:", err);
            this._onerror?.(err as Error);
        }
    }

    set onclose(handler: undefined | (() => void)) { this._onclose = handler; }
    set onerror(handler: undefined | ((error: Error) => void)) { this._onerror = handler; }
    set onmessage(handler: undefined | ((message: any) => void)) { this._onmessage = handler; }
}

// --- Custom MCP App Client ---

// Schemas for UI Protocol
// We define them loosely to avoid tight coupling and Zod version issues,
// but strict enough to be useful.
const InitializeResultSchema = z.object({
    protocolVersion: z.string(),
    hostInfo: z.object({
        name: z.string(),
        version: z.string(),
    }).passthrough(),
    hostCapabilities: z.object({}).passthrough(),
    hostContext: z.object({}).passthrough().optional(),
}).passthrough();

export class McpAppClient extends Protocol<any, any, any> {
    private _hostInfo?: any;
    private _hostContext?: any;

    public onHostContextChanged?: (context: any) => void;

    constructor(private appInfo: { name: string; version: string }) {
        super();

        // Register notification handlers
        this.setNotificationHandler(
            z.object({ method: z.literal("ui/notifications/host-context-changed"), params: z.record(z.any()) }),
            (notification) => {
                const params = notification.params;
                this._hostContext = { ...this._hostContext, ...params };
                this.onHostContextChanged?.(params);
            }
        );

        // Handle ping to keep connection alive if needed
        this.setRequestHandler(z.object({ method: z.literal("ping") }), () => ({}));
    }

    /**
     * Connect to the host using the provided transport.
     * Performs the ui/initialize handshake.
     */
    async connect(transport: Transport): Promise<void> {
        await super.connect(transport);

        // Perform Handshake
        const result = await this.request(
            {
                method: "ui/initialize",
                params: {
                    appInfo: this.appInfo,
                    protocolVersion: "2024-11-05", // Use a recent date string, or LATEST_PROTOCOL_VERSION if format matches
                    appCapabilities: {}
                }
            },
            InitializeResultSchema
        );

        this._hostInfo = result.hostInfo;
        this._hostContext = result.hostContext || {};

        console.log("MCP App Connected. Host:", this._hostInfo);

        // Notify initialized
        await this.notification({ method: "ui/notifications/initialized" });
    }

    /**
     * Call a tool on the server (proxied via Host)
     */
    async callServerTool(name: string, args: Record<string, any>) {
        return await this.request(
            {
                method: "tools/call",
                params: {
                    name,
                    arguments: args
                }
            },
            z.any() // ContextPicker expects loose result
        );
    }

    /**
     * Get a prompt from the server (proxied via Host)
     */
    async getPrompt(params: { name: string; arguments?: Record<string, string> }) {
        return await this.request(
            {
                method: "prompts/get",
                params
            },
            z.any() // Loose schema for result
        );
    }

    getHostContext() {
        return this._hostContext;
    }

    /**
     * Alias for callServerTool to satisfy Client interface partially.
     */
    async callTool(params: { name: string; arguments?: Record<string, any> }) {
        return await this.callServerTool(params.name, params.arguments || {});
    }

    /**
     * Update the model context (UI Protocol)
     */
    async updateModelContext(params: {
        content?: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
        structuredContent?: Record<string, any>
    }) {
        return await this.request(
            {
                method: "ui/update-model-context",
                params
            },
            z.any()
        );
    }

    // Abstract methods implementation
    assertCapabilityForMethod(method: string): void {
        // Allow all methods for now
    }

    assertRequestHandlerCapability(method: string): void {
        // Allow all handlers
    }

    assertNotificationCapability(method: string): void {
        // Allow all notifications
    }
}
