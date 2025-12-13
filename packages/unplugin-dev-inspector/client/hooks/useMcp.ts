import { Client } from "@modelcontextprotocol/sdk/client";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { useEffect, useRef, useState } from "react";
import { createClientExecClient } from "@mcpc-tech/cmcp";
import { TOOL_SCHEMAS } from "../../src/tool-schemas.js";
import { getDevServerBaseUrl } from "../utils/config-loader";

const STORAGE_KEY = "inspector-inspection-items";
const INSPECTION_ID_KEY = "inspector-current-inspection-id";
const TIMEOUT_MS = 600_000;

let pendingResolve: ((value: unknown) => void) | null = null;
let pendingReject: ((reason: unknown) => void) | null = null;

function clearPendingRequest() {
  pendingResolve = null;
  pendingReject = null;
}

function cancelPendingRequest(reason: string) {
  if (pendingReject) {
    pendingReject(new Error(reason));
    clearPendingRequest();
  }
}

function activateInspector() {
  window.dispatchEvent(new CustomEvent("activate-inspector"));
  return { success: true };
}

function createTextContent(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function formatElementInfo(elementInfo: any) {
  if (!elementInfo) return "";

  const { tagName, textContent, className, id: elemId, styles } = elementInfo;
  const idAttr = elemId ? ` id="${elemId}"` : "";
  const classAttr = className ? ` class="${className}"` : "";

  return `
**DOM Element**:
\`\`\`
Tag: <${tagName}${idAttr}${classAttr}>
Text: ${textContent || "(empty)"}
\`\`\`

**Key Styles**:
- display: ${styles.display}
- color: ${styles.color}
- background: ${styles.backgroundColor}
- font-size: ${styles.fontSize}
`;
}

function getAllFeedbacks() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const items = saved ? JSON.parse(saved) : [];

    if (items.length === 0) {
      return createTextContent(
        "# No Inspection Items\n\nThe queue is empty. Use 'capture_element_context' to capture elements for investigation.",
      );
    }

    const feedbackList = items
      .map((item: any, index: number) => {
        const { id, sourceInfo, description, status, progress, result } = item;
        const statusText =
          status === "loading" && progress
            ? `LOADING (${progress.completed}/${progress.total} steps)`
            : status.toUpperCase();

        return `## ${index + 1}. Feedback ID: \`${id}\`

**Status**: ${statusText}
**File**: ${sourceInfo.file}
**Line**: ${sourceInfo.line}
**Component**: ${sourceInfo.component}
${formatElementInfo(sourceInfo.elementInfo)}
**User Request**:
${description}

${result ? `**Result**: ${result}\n` : ""}---`;
      })
      .join("\n\n");

    const hint = `\n\n## How to Update\n\nUse \`update_inspection_status\` tool to update any inspection:\n\n\`\`\`\nupdate_inspection_status({\n  inspectionId: "feedback-xxx",  // Copy from above\n  status: "completed",\n  message: "Your findings here"\n})\n\`\`\``;

    return createTextContent(
      `# Inspection Queue (${items.length} items)\n\n${feedbackList}${hint}`,
    );
  } catch (e) {
    return createTextContent("# Error\n\nFailed to load inspection items.");
  }
}

function formatResult(sourceInfo: any, description: string) {
  const { file, line, component, elementInfo } = sourceInfo;

  const domInfo = elementInfo
    ? `
## DOM Element
\`\`\`
Tag: <${elementInfo.tagName}${elementInfo.id ? ` id="${elementInfo.id}"` : ""}${elementInfo.className ? ` class="${elementInfo.className}"` : ""}>
Text: ${elementInfo.textContent || "(empty)"}
DOM Path: ${elementInfo.domPath || "N/A"}
\`\`\`

### Position & Size
${
  elementInfo.boundingBox
    ? `
- **Position**: (${Math.round(elementInfo.boundingBox.x)}, ${Math.round(elementInfo.boundingBox.y)})
- **Size**: ${Math.round(elementInfo.boundingBox.width)}px × ${Math.round(elementInfo.boundingBox.height)}px
`
    : ""
}

### Computed Styles (Key Properties)
${
  elementInfo.computedStyles
    ? `
**Layout**:
- display: ${elementInfo.computedStyles.layout.display}
- position: ${elementInfo.computedStyles.layout.position}
- z-index: ${elementInfo.computedStyles.layout.zIndex}

**Typography**:
- font: ${elementInfo.computedStyles.typography.fontSize} ${elementInfo.computedStyles.typography.fontFamily}
- color: ${elementInfo.computedStyles.typography.color}
- text-align: ${elementInfo.computedStyles.typography.textAlign}

**Spacing**:
- padding: ${elementInfo.computedStyles.spacing.padding}
- margin: ${elementInfo.computedStyles.spacing.margin}

**Background & Border**:
- background: ${elementInfo.computedStyles.background.backgroundColor}
- border: ${elementInfo.computedStyles.border.border}
- border-radius: ${elementInfo.computedStyles.border.borderRadius}

**Effects**:
- opacity: ${elementInfo.computedStyles.effects.opacity}
- box-shadow: ${elementInfo.computedStyles.effects.boxShadow || "none"}
- transform: ${elementInfo.computedStyles.effects.transform || "none"}
`
    : `
**Legacy Styles**:
\`\`\`css
display: ${elementInfo.styles?.display}
color: ${elementInfo.styles?.color}
background: ${elementInfo.styles?.backgroundColor}
font-size: ${elementInfo.styles?.fontSize}
padding: ${elementInfo.styles?.padding}
margin: ${elementInfo.styles?.margin}
\`\`\`
`
}
`
    : "";

  return createTextContent(`# Element Inspection Result

## Source Code
- **File**: ${file}
- **Line**: ${line}
- **Component**: ${component}
${domInfo}
## User Request
${description}

## Your Task
1. Investigate the issue using 'chrome_devtools' tool (check console logs, network requests, performance)
2. Use 'execute_page_script' to query element state if needed
3. Update status with 'update_inspection_status':
   - "in-progress" with progress details while investigating
   - "completed" with findings when done
   - "failed" if unresolvable`);
}

function patchContext(args: any) {
  const { code } = args;

  if (!code || typeof code !== "string") {
    return createTextContent(
      'Error: Missing or invalid "code" parameter. Please provide JavaScript code to execute.',
    );
  }

  try {
    // Execute the code in the page context
    // Wrap in a function to allow return statements
    const executorFunc = new Function(code);
    const result = executorFunc();

    // Format the result
    let formattedResult: string;

    if (result === undefined) {
      formattedResult = "(undefined)";
    } else if (result === null) {
      formattedResult = "(null)";
    } else if (typeof result === "object") {
      try {
        // Try to serialize to JSON
        formattedResult = JSON.stringify(result, null, 2);
      } catch (e) {
        // If serialization fails, use toString
        formattedResult = `[Object: ${Object.prototype.toString.call(result)}]`;
      }
    } else {
      formattedResult = String(result);
    }

    return createTextContent(`${formattedResult}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : "";

    return createTextContent(
      `## Error\n\`\`\`\n${errorMessage}\n\`\`\`\n\n${errorStack ? `## Stack Trace\n\`\`\`\n${errorStack}\n\`\`\`\n` : ""}\n## Suggestions\n- Check syntax errors\n- Verify element selectors exist\n- Ensure code returns a value\n- Check browser console for additional errors`,
    );
  }
}

function updateInspectionStatus(args: any) {
  const { inspectionId: providedId, status, progress, message } = args;
  let inspectionId = providedId || sessionStorage.getItem(INSPECTION_ID_KEY) || "";

  if (!inspectionId) {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const items = saved ? JSON.parse(saved) : [];
      const loadingItem = items.find((item: any) => item.status === "in-progress");

      if (loadingItem) {
        inspectionId = loadingItem.id;
        sessionStorage.setItem(INSPECTION_ID_KEY, inspectionId);
      } else {
        return createTextContent(
          "Error: No active inspection item found. Please use 'list_inspections' to see the queue, then provide the inspectionId parameter.",
        );
      }
    } catch {
      return createTextContent("Error: No active inspection item");
    }
  }

  // Handle deletion
  if (status === "deleted") {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const items = saved ? JSON.parse(saved) : [];
      const filteredItems = items.filter((item: any) => item.id !== inspectionId);

      localStorage.setItem(STORAGE_KEY, JSON.stringify(filteredItems));
      sessionStorage.removeItem(INSPECTION_ID_KEY);

      window.dispatchEvent(
        new CustomEvent("inspection-deleted", {
          detail: { inspectionId },
        }),
      );

      return createTextContent(`Inspection ${inspectionId} deleted successfully.`);
    } catch (error) {
      return createTextContent("Error: Failed to delete inspection");
    }
  }

  if (progress) {
    window.dispatchEvent(
      new CustomEvent("plan-progress-reported", {
        detail: {
          plan: { steps: progress.steps },
          inspectionId,
          timestamp: new Date().toISOString(),
        },
      }),
    );
  }

  if (status === "completed" || status === "failed") {
    sessionStorage.removeItem(INSPECTION_ID_KEY);
    const resultMessage = message || (status === "completed" ? "Task completed" : "Task failed");
    window.dispatchEvent(
      new CustomEvent("inspection-result-received", {
        detail: {
          status: status,
          result: { message: resultMessage },
          inspectionId,
        },
      }),
    );
    return createTextContent(`Inspection marked as ${status}.`);
  } else if (status === "in-progress" && message && !progress) {
    window.dispatchEvent(
      new CustomEvent("inspection-status-updated", {
        detail: {
          status: "in-progress",
          message: message,
          inspectionId,
        },
      }),
    );
  }

  return createTextContent("Status updated");
}

export function useMcp() {
  const clientRef = useRef<Client | null>(null);
  const [isClientReady, setIsClientReady] = useState(false);

  useEffect(() => {
    if (clientRef.current) return;

    const client = createClientExecClient(
      new Client({ name: "inspector", version: "0.1.0" }, { capabilities: { tools: {} } }),
      "inspector",
    );

    // Tool implementations
    async function inspectElement() {
      cancelPendingRequest("New inspect request started");
      activateInspector();

      return new Promise((resolve, reject) => {
        pendingResolve = resolve;
        pendingReject = reject;

        setTimeout(() => {
          if (pendingReject === reject) {
            clearPendingRequest();
            reject(new Error("Timeout: No element selected"));
          }
        }, TIMEOUT_MS);
      });
    }

    // Event handlers
    function handleElementInspected(event: CustomEvent) {
      if (!pendingResolve) return;

      const { sourceInfo, description, inspectionId } = event.detail;
      sessionStorage.setItem(INSPECTION_ID_KEY, inspectionId);

      pendingResolve(formatResult(sourceInfo, description));
      clearPendingRequest();
    }

    function handleInspectorCancelled() {
      sessionStorage.removeItem(INSPECTION_ID_KEY);
      cancelPendingRequest("Inspector cancelled by user");
    }

    // Register all event listeners
    const eventHandlers = [
      {
        event: "element-inspected",
        handler: handleElementInspected,
      },
      {
        event: "inspector-cancelled",
        handler: handleInspectorCancelled,
      },
    ];

    eventHandlers.forEach(({ event, handler }) => {
      window.addEventListener(event, handler as EventListener);
    });

    // Built-in tools
    const builtInTools = [
      {
        ...TOOL_SCHEMAS.list_inspections,
        implementation: getAllFeedbacks,
      },
      {
        ...TOOL_SCHEMAS.capture_element_context,
        implementation: inspectElement,
      },
      {
        ...TOOL_SCHEMAS.update_inspection_status,
        implementation: updateInspectionStatus,
      },
      {
        ...TOOL_SCHEMAS.execute_page_script,
        implementation: patchContext,
      },
    ];

    // Get custom tools from the global registry
    const getCustomTools = () => {
      // Access the global function exposed by the virtual module
      const getTools = (window as any).__getInspectorTools;
      if (!getTools) return [];

      const customTools = getTools();
      return customTools.map((tool: any) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        implementation: async (args: Record<string, unknown>) => {
          try {
            const result = await tool.implementation(args);

            // Format result for MCP
            if (result === undefined || result === null) {
              return createTextContent("(no result)");
            }

            if (typeof result === "object") {
              // Check if already in MCP format
              if (
                "content" in result &&
                Array.isArray((result as { content: unknown[] }).content)
              ) {
                return result;
              }
              return createTextContent(JSON.stringify(result, null, 2));
            }

            return createTextContent(String(result));
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error.stack : "";
            return createTextContent(
              `# Error executing ${tool.name}\n\n\`\`\`\n${errorMessage}\n\`\`\`\n\n${errorStack ? `## Stack Trace\n\`\`\`\n${errorStack}\n\`\`\`\n` : ""}`,
            );
          }
        },
      }));
    };

    // Combine built-in and custom tools, then register all at once
    // (registerTools is a full override, so we must register everything together)
    const customTools = getCustomTools();
    const allTools = [...builtInTools, ...customTools];

    client.registerTools(allTools);

    if (customTools.length > 0) {
      console.log(
        `[dev-inspector] Registered ${customTools.length} custom tool(s):`,
        customTools.map((t: any) => t.name).join(", "),
      );
    }

    const transport = new SSEClientTransport(
      new URL(`/__mcp__/sse?clientId=inspector`, getDevServerBaseUrl()),
    );

    client
      .connect(transport)
      .then(() => {
        clientRef.current = client;
        setIsClientReady(true);
      })
      .catch((err) => {
        console.error("MCP connection error:", err);
      });

    return () => {
      eventHandlers.forEach(({ event, handler }) => {
        window.removeEventListener(event, handler as EventListener);
      });
      transport.close?.();
    };
  }, []);

  return { client: clientRef.current, isClientReady };
}
