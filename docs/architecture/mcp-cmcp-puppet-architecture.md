# Dev Inspector MCP Architecture

## Overview

Dev Inspector MCP is a system that integrates the Model Context Protocol (MCP) into frontend development tools, allowing AI agents (such as VS Code Copilot) to interact directly with frontend applications running in the browser. The entire system is built on the **CMCP (Client MCP)** library, implementing a complex bidirectional communication mechanism.

## Table of Contents

- [Core Concepts](#core-concepts)
- [Architecture Diagram](#architecture-diagram)
- [CMCP Library Core Functions](#cmcp-library-core-functions)
- [Connection Manager](#connection-manager)
- [MCP Context Design](#mcp-context-design)
- [Scenario Analysis](#scenario-analysis)
- [Client Tool Implementation](#client-tool-implementation)
- [Data Persistence](#data-persistence)
- [Chrome DevTools Integration](#chrome-devtools-integration)

---

## Core Concepts

### Role Definitions

The system consists of four main roles:

| Role | Description | Runtime Environment |
|------|-------------|---------------------|
| **AI Agent (Host)** | AI tools like VS Code Copilot | VS Code Process |
| **Dev Server** | Vite dev server + MCP middleware | Node.js Process |
| **Inspector Client** | Inspector UI component in browser | Browser Process |
| **Chrome Watcher** | Chrome DevTools MCP client | Node.js Child Process |

### Transport Protocols

The system supports two MCP transport protocols:

```
┌─────────────────────────────────────────────────────────────┐
│                    Transport Protocol Selection              │
├─────────────────────────────────────────────────────────────┤
│  Streamable HTTP (Recommended)                              │
│  - Uses HTTP POST + SSE streaming                           │
│  - Supports session management                              │
│  - Endpoint: /__mcp__ (POST/GET/DELETE)                     │
├─────────────────────────────────────────────────────────────┤
│  SSE (Deprecated)                                           │
│  - Uses Server-Sent Events                                  │
│  - Endpoint: /__mcp__/sse (GET) + /__mcp__/messages (POST)  │
└─────────────────────────────────────────────────────────────┘
```

---

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              VS Code / AI Agent                               │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  Calls MCP Tools: capture_element_context, list_inspections, etc.       │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        │ MCP Protocol (JSON-RPC 2.0)
                                        ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                           Vite Dev Server + MCP Middleware                    │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  mcproute-middleware.ts                                                  │ │
│  │  ├── setupMcpMiddleware()                                               │ │
│  │  ├── handleStreamableHttpPost/Get/Delete                                │ │
│  │  └── handleSseConnection / handleSseMessage                             │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  connection-manager.ts                                                   │ │
│  │  ├── transports: Record<sessionId, Transport>                           │ │
│  │  ├── handleInspectorConnection()                                        │ │
│  │  ├── handleWatcherConnection()                                          │ │
│  │  └── rebindWatchersToInspector()                                        │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  mcp.ts - createInspectorMcpServer()                                     │ │
│  │  ├── mcpc() - Create MCP Server                                         │ │
│  │  ├── createClientExecServer() - CMCP server wrapper                     │ │
│  │  └── registerClientToolSchemas() - Register client-side tools           │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
                │                                           │
                │ SSE Transport                             │ stdio Transport
                │ (clientId=inspector)                      │
                ▼                                           ▼
┌────────────────────────────────────────┐      ┌────────────────────────────────────┐
│     Browser Inspector Client           │      │      Chrome DevTools MCP Server    │
│  ┌──────────────────────────────────┐  │      │  ┌────────────────────────────────┐│
│  │  useMcp.ts                       │  │      │  │  chrome-devtools-mcp binary    ││
│  │  ├── createClientExecClient()    │  │      │  │  ├── chrome_navigate_page      ││
│  │  ├── registerTools()             │  │      │  │  ├── chrome_click               ││
│  │  └── SSEClientTransport          │  │      │  │  ├── chrome_evaluate_script     ││
│  └──────────────────────────────────┘  │      │  │  └── ... (more Chrome tools)    ││
│  ┌──────────────────────────────────┐  │      │  └────────────────────────────────┘│
│  │  Tool Implementations:           │  │      └────────────────────────────────────┘
│  │  ├── inspectElement()            │  │                      │
│  │  ├── getAllFeedbacks()           │  │                      │ bindPuppet()
│  │  ├── updateInspectionStatus()    │  │                      │
│  │  └── patchContext()              │  │                      ▼
│  └──────────────────────────────────┘  │      ┌────────────────────────────────────┐
└────────────────────────────────────────┘      │         Puppet Binding Mechanism    │
                                                │  Chrome Watcher ←→ Inspector        │
                                                │  Automatic Message Forwarding       │
                                                └────────────────────────────────────┘
```

---

## MCP Context Design

### Overview

The MCP context in Dev Inspector is designed around a **hub-and-spoke model** where the Vite dev server acts as the central hub, managing connections between multiple clients and tools.

### Context Layers

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           MCP Context Layers                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Layer 1: AI Agent Context                                                  │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  • MCP Client in VS Code                                              │  │
│  │  • Consumes tools exposed by dev server                               │  │
│  │  • Receives tool results and updates UI                               │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│                                    ▼                                        │
│  Layer 2: Server Context (Hub)                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  • MCP Server in Vite middleware                                      │  │
│  │  • Manages multiple client connections                                │  │
│  │  • Routes tool calls to appropriate handlers                          │  │
│  │  • Maintains session state via ConnectionManager                      │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                          │                    │                             │
│                          ▼                    ▼                             │
│  Layer 3: Client Execution Context                                          │
│  ┌─────────────────────────────┐  ┌─────────────────────────────────────┐  │
│  │  Browser Inspector          │  │  Chrome DevTools MCP                │  │
│  │  • Executes browser-side    │  │  • Executes Chrome automation       │  │
│  │    tools                    │  │  • Puppeteer-based control          │  │
│  │  • DOM inspection           │  │  • Network/Console monitoring       │  │
│  │  • User interaction         │  │  • Performance analysis             │  │
│  └─────────────────────────────┘  └─────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Tool Categories

The MCP tools are organized into three categories based on where they execute:

#### 1. Server-Side Tools (Execute on Dev Server)

These tools run directly on the Node.js server:

| Tool | Description |
|------|-------------|
| `chrome_devtools` | Proxy tool that delegates to Chrome DevTools MCP |

#### 2. Client-Side Tools (Execute in Browser)

These tools are registered on the server but execute in the browser:

| Tool | Description |
|------|-------------|
| `capture_element_context` | Activates element selector, captures DOM info |
| `list_inspections` | Returns all inspection items from localStorage |
| `update_inspection_status` | Updates inspection status and triggers events |
| `execute_page_script` | Executes JavaScript in browser context |

#### 3. Delegated Tools (Execute in Child Process)

These tools are delegated to the Chrome DevTools MCP server:

| Tool | Description |
|------|-------------|
| `chrome_navigate_page` | Navigate browser to URL |
| `chrome_click` | Click on element |
| `chrome_fill` | Fill form fields |
| `chrome_evaluate_script` | Execute script in page |
| `chrome_list_network_requests` | List network requests |
| `chrome_list_console_messages` | List console messages |
| ... | (20+ more Chrome tools) |

### Prompt System

MCP Prompts provide pre-defined interaction templates:

```typescript
const PROMPT_SCHEMAS = {
  capture_element: {
    name: "capture_element",
    title: "Capture Element Context",
    description: "Capture context about a UI element for troubleshooting",
  },
  view_inspections: {
    name: "view_inspections", 
    title: "View All Inspections",
    description: "View all element inspections in the queue with their status",
  },
  launch_chrome_devtools: {
    name: "launch_chrome_devtools",
    title: "Launch Chrome DevTools",
    description: "Launch Chrome DevTools and navigate to URL",
  },
  get_network_requests: {
    name: "get_network_requests",
    title: "Get Network Requests",
    description: "List or get details of network requests",
  },
  get_console_messages: {
    name: "get_console_messages",
    title: "Get Console Messages", 
    description: "List or get details of console messages",
  },
};
```

### Session Management

Each connection is managed with a unique session ID:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Session Management Flow                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. Client connects to /__mcp__/sse?clientId=inspector                      │
│     └── Server creates SSEServerTransport                                   │
│     └── Generates unique sessionId                                          │
│     └── Registers in ConnectionManager.transports                           │
│                                                                             │
│  2. URL parameters determine behavior:                                      │
│     ├── clientId = who is connecting (inspector, vscode, acp, cursor)       │
│     └── puppetId = who to control (inspector) - only for watchers           │
│                                                                             │
│  3. Connection types:                                                       │
│     ├── clientId="inspector" → handleInspectorConnection()                  │
│     │   └── Updates latestInspectorSessionId                                │
│     │   └── Rebinds all watchers to new Inspector                           │
│     └── clientId="vscode" + puppetId="inspector" → handleWatcherConnection()│
│         └── Tracked in watchersByClientId                                   │
│         └── Binds to current Inspector via bindPuppet()                     │
│                                                                             │
│  4. On disconnect:                                                          │
│     └── transport.onclose triggers                                          │
│     └── ConnectionManager.removeTransport() cleans up                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## CMCP Library Core Functions

CMCP (`@mcpc-tech/cmcp`) is the core library of this architecture, providing the following key features:

### 1. `createClientExecServer()`

Wraps a regular MCP Server to support client-side execution.

```typescript
// mcp.ts
const mcpServer = await mcpc([...]);
const mcpClientExecServer = createClientExecServer(mcpServer, "inspector");

// Register tool schemas that need to be executed on the client
mcpClientExecServer.registerClientToolSchemas([
  TOOL_SCHEMAS.capture_element_context,
  TOOL_SCHEMAS.list_inspections,
  TOOL_SCHEMAS.update_inspection_status,
  TOOL_SCHEMAS.execute_page_script,
]);
```

**How it works**:
- When the AI Agent calls `capture_element_context`, the request is forwarded to the browser client for execution
- The server does not execute these tools, only handles routing

### 2. `createClientExecClient()`

Wraps a regular MCP Client to execute local tools.

```typescript
// useMcp.ts
const client = createClientExecClient(
  new Client(
    { name: "inspector", version: "0.1.0" },
    { capabilities: { tools: {} } }
  ),
  "inspector"  // Client type identifier
);

// Register actual tool implementations
client.registerTools([
  {
    ...TOOL_SCHEMAS.list_inspections,
    implementation: getAllFeedbacks,  // Local implementation function
  },
  {
    ...TOOL_SCHEMAS.capture_element_context,
    implementation: inspectElement,
  },
  // ...
]);
```

**How it works**:
- Client provides `implementation` function when registering tools
- When the server forwards a tool call request, the client executes the corresponding implementation

### 3. `bindPuppet()`

Establishes a "puppet" binding relationship between two Transports.

```typescript
// connection-manager.ts
import { bindPuppet } from "@mcpc-tech/cmcp";

// bindPuppet(puppet, host) -> bindPuppet(watcher, inspector)
const boundTransport = bindPuppet(watcherTransport, inspectorTransport);
```

**Puppet Mechanism Explained**:

```
┌─────────────────────────────────────────────────────────────┐
│                    Puppet Binding Diagram                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐      ┌─────────────────┐              │
│  │ Chrome Watcher  │      │    Inspector    │              │
│  │   (Puppet)      │◄────►│     (Host)      │              │
│  └─────────────────┘      └─────────────────┘              │
│         │                         │                         │
│         │ bindPuppet()            │                         │
│         ▼                         ▼                         │
│  ┌──────────────────────────────────────────┐              │
│  │           Message Forwarding              │              │
│  │  Messages to Watcher → Forward to Inspector│             │
│  │  Inspector responses → Forward to Watcher │              │
│  └──────────────────────────────────────────┘              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Connection Manager

`ConnectionManager` is the connection hub of the entire system:

```typescript
export class ConnectionManager {
  // All active Transport connections
  public transports: Record<string, Transport> = {};
  
  // Latest Inspector client session ID
  private latestInspectorSessionId: string | null = null;
  
  // All Chrome Watcher session IDs
  private chromeWatcherSessionIds = new Set<string>();
  
  // Established Puppet bindings
  private boundPuppets = new Map<string, any>();
}
```

### Key Methods

#### `handleInspectorConnection(sessionId)`

When an Inspector client connects:
1. Updates `latestInspectorSessionId`
2. Calls `rebindWatchersToInspector()` to rebind all Chrome Watchers

```typescript
handleInspectorConnection(sessionId: string) {
  this.latestInspectorSessionId = sessionId;
  this.rebindWatchersToInspector(sessionId);
}
```

#### `handleWatcherConnection(sessionId, puppetId, transport)`

When a Chrome Watcher connects:
1. If `puppetId === "chrome"`, add to `chromeWatcherSessionIds`
2. If an Inspector connection exists, immediately establish Puppet binding

```typescript
handleWatcherConnection(sessionId, puppetId, transport) {
  if (puppetId === "chrome") {
    this.chromeWatcherSessionIds.add(sessionId);
    if (this.latestInspectorSessionId) {
      const boundTransport = bindPuppet(transport, inspectorTransport);
      this.boundPuppets.set(sessionId, boundTransport);
    }
  }
}
```

---

## Scenario Analysis

### Scenario 1: AI Calls `capture_element_context`

```
Sequence Diagram:
─────────────────────────────────────────────────────────────────────

AI Agent                Dev Server                 Browser Inspector
   │                        │                            │
   │ tools/call             │                            │
   │ capture_element_context│                            │
   │───────────────────────►│                            │
   │                        │                            │
   │                        │ (createClientExecServer    │
   │                        │  identifies as client tool)│
   │                        │                            │
   │                        │ Forward to inspector client│
   │                        │───────────────────────────►│
   │                        │                            │
   │                        │                            │ activateInspector()
   │                        │                            │ (show crosshair cursor)
   │                        │                            │
   │                        │                            │ User clicks element
   │                        │                            │
   │                        │                            │ CustomEvent:
   │                        │                            │ "element-inspected"
   │                        │                            │
   │                        │          Result            │
   │                        │◄───────────────────────────│
   │         Result         │                            │
   │◄───────────────────────│                            │
   │                        │                            │

─────────────────────────────────────────────────────────────────────
```

### Scenario 2: AI Calls `chrome_devtools` Tool

```
Sequence Diagram:
─────────────────────────────────────────────────────────────────────

AI Agent        Dev Server       Chrome DevTools MCP    Browser
   │                │                    │                 │
   │ tools/call     │                    │                 │
   │ chrome_devtools│                    │                 │
   │ (useTool:      │                    │                 │
   │  navigate_page)│                    │                 │
   │───────────────►│                    │                 │
   │                │                    │                 │
   │                │ (mcpc dependency   │                 │
   │                │  resolution)       │                 │
   │                │ Launch chrome-devtools-mcp          │
   │                │───────────────────►│                 │
   │                │                    │                 │
   │                │                    │ Puppeteer       │
   │                │                    │ controls Chrome │
   │                │                    │────────────────►│
   │                │                    │                 │
   │                │                    │   Open page     │
   │                │                    │◄────────────────│
   │                │      Result        │                 │
   │                │◄───────────────────│                 │
   │     Result     │                    │                 │
   │◄───────────────│                    │                 │

─────────────────────────────────────────────────────────────────────
```

### Scenario 3: Inspector Reconnects After Refresh

```
Sequence Diagram:
─────────────────────────────────────────────────────────────────────

Browser (after refresh)    Dev Server              Chrome Watcher
      │                         │                        │
      │ SSE connection          │                        │ (existing connection)
      │ clientId=inspector      │                        │
      │────────────────────────►│                        │
      │                         │                        │
      │                         │ handleInspectorConnection()
      │                         │                        │
      │                         │ rebindWatchersToInspector()
      │                         │                        │
      │                         │  1. unbindPuppet() unbind old
      │                         │  2. bindPuppet() establish new
      │                         │───────────────────────►│
      │                         │                        │
      │    Puppet binding done  │                        │
      │◄───────────────────────►│◄───────────────────────│
      │                         │                        │
      │  Chrome tool messages   │                        │
      │  now forward to new     │                        │
      │  Inspector client       │                        │

─────────────────────────────────────────────────────────────────────
```

### Scenario 4: Multiple Watchers (VSCode + ACP) Simultaneously

```
Connection State Diagram:
─────────────────────────────────────────────────────────────────────

                    ConnectionManager
                          │
     ┌────────────────────┼────────────────────┐
     │                    │                    │
     ▼                    ▼                    ▼
┌──────────┐       ┌──────────┐        ┌──────────┐
│ Inspector│       │  VSCode  │        │   ACP    │
│ (browser)│       │ Watcher  │        │ Watcher  │
│ clientId=│       │ clientId=│        │ clientId=│
│ inspector│       │  vscode  │        │   acp    │
└──────────┘       └──────────┘        └──────────┘
     ▲                    │                    │
     │                    │ puppetId=inspector │ puppetId=inspector
     └────────────────────┴────────────────────┘
           bindPuppet() bound to same Inspector

watchersByClientId = Map {
  "vscode" => Set { session-abc },
  "acp"    => Set { session-xyz }
}

Each clientId can have only one active connection.
Multiple different clientIds can coexist.

─────────────────────────────────────────────────────────────────────
```

### Scenario 5: Full Debugging Flow

```
Complete Flow Diagram:
─────────────────────────────────────────────────────────────────────

User                 AI Agent              Dev Server           Browser
 │                      │                      │                   │
 │ "Debug this button"  │                      │                   │
 │─────────────────────►│                      │                   │
 │                      │                      │                   │
 │                      │ capture_element_context                  │
 │                      │─────────────────────►│                   │
 │                      │                      │──────────────────►│
 │                      │                      │                   │
 │                      │                      │   [Crosshair UI]  │
 │                      │                      │◄──────────────────│
 │                      │                      │                   │
 │ Click on button      │                      │                   │
 │─────────────────────────────────────────────────────────────────►
 │                      │                      │                   │
 │                      │         Element context returned         │
 │                      │◄─────────────────────│◄──────────────────│
 │                      │                      │                   │
 │                      │ chrome_devtools (evaluate_script)        │
 │                      │─────────────────────►│                   │
 │                      │                      │ [via Puppeteer]   │
 │                      │                      │──────────────────►│
 │                      │                      │                   │
 │                      │         Script result                    │
 │                      │◄─────────────────────│◄──────────────────│
 │                      │                      │                   │
 │                      │ update_inspection_status (completed)     │
 │                      │─────────────────────►│──────────────────►│
 │                      │                      │                   │
 │  "Found the issue:   │                      │  [UI updated]     │
 │   missing handler"   │                      │                   │
 │◄─────────────────────│                      │                   │

─────────────────────────────────────────────────────────────────────
```

---

## Client Tool Implementation Details

### `inspectElement()` - Element Capture

```typescript
async function inspectElement() {
  // Cancel previous request
  cancelPendingRequest("New inspect request started");
  
  // Activate Inspector UI
  activateInspector();  // Dispatch "activate-inspector" event

  return new Promise((resolve, reject) => {
    pendingResolve = resolve;
    pendingReject = reject;

    // Timeout handling (10 minutes)
    setTimeout(() => {
      if (pendingReject === reject) {
        clearPendingRequest();
        reject(new Error("Timeout: No element selected"));
      }
    }, TIMEOUT_MS);
  });
}
```

### Event-Driven Flow

```
┌─────────────────────────────────────────────────────────────┐
│                      Event Flow Diagram                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  useMcp.ts                        inspector.tsx             │
│      │                                │                     │
│      │ "activate-inspector"           │                     │
│      │───────────────────────────────►│                     │
│      │                                │                     │
│      │                                │ setIsActive(true)   │
│      │                                │ cursor: crosshair   │
│      │                                │                     │
│      │                                │ User clicks element │
│      │                                │                     │
│      │                                │ handleInspectionSubmit()
│      │                                │                     │
│      │      "element-inspected"       │                     │
│      │◄───────────────────────────────│                     │
│      │                                │                     │
│      │ handleElementInspected()       │                     │
│      │ pendingResolve(result)         │                     │
│      │                                │                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### `updateInspectionStatus()` - Status Update

Supported state transitions:

```
┌─────────────────────────────────────────────────────────────┐
│                    State Machine                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│    pending ──────► in-progress ──────► completed            │
│       │                 │                                   │
│       │                 │                                   │
│       └────────────────►└──────────────► failed             │
│                         │                                   │
│                         └──────────────► deleted            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

CustomEvents dispatched when updating status:

| Status Change | Dispatched Event |
|---------------|------------------|
| in-progress + progress | `plan-progress-reported` |
| completed / failed | `inspection-result-received` |
| in-progress + message | `inspection-status-updated` |
| deleted | `inspection-deleted` |

---

## Data Persistence

The system uses `localStorage` and `sessionStorage` for data persistence:

```typescript
// localStorage - Persistent inspection items list
const STORAGE_KEY = 'inspector-inspection-items';

// sessionStorage - Current active inspection ID
const INSPECTION_ID_KEY = 'inspector-current-inspection-id';
```

### Data Structure

```typescript
interface InspectionItem {
  id: string;                    // Unique identifier
  sourceInfo: {
    file: string;                // Source file path
    component: string;           // Component name
    line: number;                // Line number
    column: number;              // Column number
    elementInfo?: {              // DOM element info
      tagName: string;
      textContent: string;
      className: string;
      id: string;
      styles: CSSStyleDeclaration;
      boundingBox: DOMRect;
      computedStyles: {
        layout: { display, position, zIndex };
        typography: { fontSize, fontFamily, color, textAlign };
        spacing: { padding, margin };
        background: { backgroundColor };
        border: { border, borderRadius };
        effects: { opacity, boxShadow, transform };
      };
    };
  };
  description: string;           // User description
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  progress?: {                   // Progress info
    steps: Array<{
      id: number;
      title: string;
      status: 'pending' | 'in-progress' | 'completed' | 'failed';
    }>;
  };
  timestamp: number;
}
```

---

## Chrome DevTools Integration

Chrome DevTools is integrated through `mcpc`'s dependency mechanism:

```typescript
// mcp.ts
const mcpServer = await mcpc(
  [...],
  [
    {
      name: "chrome_devtools",
      description: "Access Chrome DevTools for browser diagnostics...",
      deps: {
        mcpServers: {
          chrome: {
            transportType: "stdio",
            command: "node",
            args: [getChromeDevToolsBinPath()],
          },
        },
      },
      options: {
        refs: [
          '<tool name="chrome.navigate_page"/>',
          '<tool name="chrome.click"/>',
          '<tool name="chrome.hover"/>',
          '<tool name="chrome.fill"/>',
          '<tool name="chrome.evaluate_script"/>',
          '<tool name="chrome.take_screenshot"/>',
          '<tool name="chrome.list_network_requests"/>',
          '<tool name="chrome.list_console_messages"/>',
          // ... more tool references
        ],
      },
    },
  ],
);
```

### Tool Proxy Pattern

`chrome_devtools` is a proxy tool that selects the actual sub-tool through parameters:

```typescript
// Call example
{
  name: "chrome_devtools",
  arguments: {
    useTool: 'chrome_navigate_page',
    hasDefinitions: ['chrome_navigate_page'],
    chrome_navigate_page: {
      url: 'http://localhost:5173'
    }
  }
}
```

### Available Chrome Tools

| Category | Tools |
|----------|-------|
| **Navigation** | navigate_page, list_pages, select_page, close_page, new_page |
| **Interaction** | click, hover, fill, fill_form, press_key, drag, wait_for |
| **Inspection** | evaluate_script, take_screenshot, take_snapshot |
| **Network** | list_network_requests, get_network_request |
| **Console** | list_console_messages, get_console_message |
| **Performance** | performance_start_trace, performance_stop_trace, performance_analyze_insight |
| **Settings** | handle_dialog, resize_page, emulate |

---

## Summary

Core innovations of the Dev Inspector MCP architecture:

1. **CMCP Bidirectional Execution Model**: Allows server to define tool schemas while clients provide implementations
2. **Puppet Binding Mechanism**: Enables message passthrough between Chrome DevTools and Inspector
3. **Dynamic Rebinding**: Supports automatic connection recovery after Inspector refresh
4. **Event-Driven Async Model**: Seamless integration of user interactions with MCP calls
5. **Hub-and-Spoke Context**: Central server manages multiple client types with different capabilities

This architecture enables AI Agents to:
- Interact directly with browser DOM
- Access all Chrome DevTools functionality
- Capture user-selected element context
- Track debugging progress in real-time
- Execute scripts in page context
- Monitor network and console activity
