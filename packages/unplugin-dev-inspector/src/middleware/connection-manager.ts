import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { bindPuppet } from "@mcpc-tech/cmcp";

type Transport = StreamableHTTPServerTransport | SSEServerTransport;

/**
 * Manages MCP transport connections between Watcher (VS Code/ACP) and Inspector (Browser).
 * Each clientId can have only one active connection at a time.
 */
export class ConnectionManager {
  public transports: Record<string, Transport> = {};
  private latestInspectorSessionId: string | null = null;
  private boundPuppets = new Map<string, { unbindPuppet: () => void }>();
  // Track watchers by clientId: clientId -> Set of sessionIds
  private watchersByClientId = new Map<string, Set<string>>();

  getTransport(sessionId: string): Transport | undefined {
    return this.transports[sessionId];
  }

  registerTransport(sessionId: string, transport: Transport) {
    this.transports[sessionId] = transport;
    transport.onclose = () => this.removeTransport(sessionId);
  }

  removeTransport(sessionId: string) {
    console.log(`[dev-inspector] [connection-manager] Removing transport: ${sessionId}`);
    delete this.transports[sessionId];

    // Clean up from all clientId sets
    for (const [_clientId, sessionIds] of this.watchersByClientId) {
      if (sessionIds.has(sessionId)) {
        sessionIds.delete(sessionId);
        const boundPuppet = this.boundPuppets.get(sessionId);
        if (boundPuppet) {
          boundPuppet.unbindPuppet();
        }
        this.boundPuppets.delete(sessionId);
      }
    }
  }

  /**
   * Clean up previous watcher connections for the same clientId.
   * Ensures only one connection per clientId is active.
   */
  private cleanupPreviousWatchers(clientId: string, newSessionId: string) {
    const sessionIds = this.watchersByClientId.get(clientId);
    if (!sessionIds) return;

    const sessionsToRemove: string[] = [];

    for (const existingSessionId of sessionIds) {
      if (existingSessionId === newSessionId) continue;

      // Unbind puppet
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

    if (sessionsToRemove.length > 0) {
      console.log(`[dev-inspector] [connection-manager] Cleaned up ${sessionsToRemove.length} previous sessions for clientId=${clientId} (new session=${newSessionId})`);
    }

    for (const sessionId of sessionsToRemove) {
      sessionIds.delete(sessionId);
    }
  }

  handleInspectorConnection(sessionId: string) {
    this.latestInspectorSessionId = sessionId;
    this.rebindWatchersToInspector(sessionId);
  }

  private rebindWatchersToInspector(inspectorSessionId: string) {
    const inspectorTransport = this.transports[inspectorSessionId];
    if (!inspectorTransport) return;

    // Rebind all watchers to the new inspector
    for (const [_clientId, sessionIds] of this.watchersByClientId) {
      for (const watcherSessionId of sessionIds) {
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
  }

  /**
   * Get the currently active Inspector (browser) transport
   */
  getInspectorTransport(): Transport | null {
    if (!this.latestInspectorSessionId) return null;
    return this.transports[this.latestInspectorSessionId] || null;
  }

  /**
   * Bind watcher (e.g. VS Code/ACP) to Inspector (browser)
   */
  handleWatcherConnection(
    sessionId: string,
    clientId: string,
    puppetId: string,
    transport: Transport,
  ) {
    // Clean up previous watchers with the same clientId
    this.cleanupPreviousWatchers(clientId, sessionId);

    // Track this watcher under its clientId
    if (!this.watchersByClientId.has(clientId)) {
      this.watchersByClientId.set(clientId, new Set());
    }
    this.watchersByClientId.get(clientId)!.add(sessionId);

    // Bind to inspector if puppetId is "inspector" and inspector is available
    if (puppetId === "inspector" && this.latestInspectorSessionId) {
      const inspectorTransport = this.transports[this.latestInspectorSessionId];
      if (inspectorTransport) {
        const boundTransport = bindPuppet(transport, inspectorTransport);
        this.boundPuppets.set(sessionId, boundTransport);
        return boundTransport;
      }
    }

    return null;
  }
}
