import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { bindPuppet } from "@mcpc-tech/cmcp";

type Transport = StreamableHTTPServerTransport | SSEServerTransport;

/**
 * Manages MCP transport connections between Watcher (VS Code) and Inspector (Browser).
 * Ensures only one chrome puppet binding is active at a time.
 */
export class ConnectionManager {
  public transports: Record<string, Transport> = {};
  private latestInspectorSessionId: string | null = null;
  private chromeWatcherSessionIds = new Set<string>();
  private boundPuppets = new Map<string, { unbindPuppet: () => void }>();

  getTransport(sessionId: string): Transport | undefined {
    return this.transports[sessionId];
  }

  registerTransport(sessionId: string, transport: Transport) {
    this.transports[sessionId] = transport;
    transport.onclose = () => this.removeTransport(sessionId);
  }

  removeTransport(sessionId: string) {
    delete this.transports[sessionId];

    if (this.chromeWatcherSessionIds.has(sessionId)) {
      this.chromeWatcherSessionIds.delete(sessionId);
      
      const boundPuppet = this.boundPuppets.get(sessionId);
      if (boundPuppet) {
        boundPuppet.unbindPuppet();
      }
      this.boundPuppets.delete(sessionId);
    }
  }

  /**
   * Clean up previous chrome watcher connections when a new one connects.
   */
  private cleanupPreviousChromeWatchers(newSessionId: string) {
    const sessionsToRemove: string[] = [];
    
    for (const existingSessionId of this.chromeWatcherSessionIds) {
      if (existingSessionId === newSessionId) continue;
      
      // Unbind puppet to restore inspector's original send method
      const boundPuppet = this.boundPuppets.get(existingSessionId);
      if (boundPuppet) {
        boundPuppet.unbindPuppet();
      }
      this.boundPuppets.delete(existingSessionId);
      
      // Close and remove the old transport
      const transport = this.transports[existingSessionId];
      if (transport) {
        try {
          transport.close?.();
        } catch {
          // Ignore close errors
        }
        delete this.transports[existingSessionId];
      }
      
      sessionsToRemove.push(existingSessionId);
    }
    
    for (const sessionId of sessionsToRemove) {
      this.chromeWatcherSessionIds.delete(sessionId);
    }
  }

  handleInspectorConnection(sessionId: string) {
    this.latestInspectorSessionId = sessionId;
    this.rebindWatchersToInspector(sessionId);
  }

  private rebindWatchersToInspector(inspectorSessionId: string) {
    const inspectorTransport = this.transports[inspectorSessionId];
    if (!inspectorTransport) return;

    for (const watcherSessionId of this.chromeWatcherSessionIds) {
      const watcherTransport = this.transports[watcherSessionId];
      if (!watcherTransport) continue;

      // Unbind previous puppet if exists
      const previousBound = this.boundPuppets.get(watcherSessionId);
      if (previousBound) {
        previousBound.unbindPuppet();
      }

      // Bind to new inspector
      const newBound = bindPuppet(watcherTransport, inspectorTransport);
      this.boundPuppets.set(watcherSessionId, newBound);
    }
  }

  handleWatcherConnection(
    sessionId: string,
    puppetId: string,
    transport: Transport,
  ) {
    if (puppetId === "chrome") {
      // Clean up previous chrome watchers to ensure only one is active
      this.cleanupPreviousChromeWatchers(sessionId);
      this.chromeWatcherSessionIds.add(sessionId);

      if (this.latestInspectorSessionId) {
        const inspectorTransport = this.transports[this.latestInspectorSessionId];
        if (inspectorTransport) {
          const boundTransport = bindPuppet(transport, inspectorTransport);
          this.boundPuppets.set(sessionId, boundTransport);
          return boundTransport;
        }
      }
    } else {
      // Other puppet IDs: bind directly to target transport
      const targetTransport = this.transports[puppetId];
      if (targetTransport) {
        return bindPuppet(transport, targetTransport);
      }
    }
    return null;
  }
}
