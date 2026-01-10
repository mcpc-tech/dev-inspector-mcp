import { Client } from "@modelcontextprotocol/sdk/client";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { useEffect, useRef, useState } from "react";
import { createClientExecClient } from "@mcpc-tech/cmcp";
import { TOOL_SCHEMAS } from "../../src/tool-schemas.js";
import { getDevServerBaseUrl } from "../utils/config-loader";
import { formatCopyContext, formatElementAnnotations } from "../utils/format";

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

// Create MCP image content from base64 data URL
function createImageContent(dataUrl: string) {
  // Extract base64 data from data URL (remove "data:image/png;base64," prefix)
  const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, "");
  return { type: "image" as const, data: base64Data, mimeType: "image/png" };
}

// KISS: Reuse shared format function with simplified output for list view
function formatElementInfoSimple(elementInfo: any) {
  if (!elementInfo) return "";
  const { tagName, textContent, className, id: elemId } = elementInfo;
  const idAttr = elemId ? ` id="${elemId}"` : "";
  const classAttr = className ? ` class="${className}"` : "";
  return `\n**DOM Element**: \`<${tagName}${idAttr}${classAttr}>\` - ${textContent || "(empty)"}\n`;
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

        // Format annotations using shared helper (KISS principle)
        const notesSection = formatElementAnnotations({
          primaryNote: sourceInfo.note,
          primaryTag: sourceInfo.elementInfo?.tagName?.toLowerCase() || sourceInfo.component,
          relatedElements: sourceInfo.relatedElements,
        });

        return `## ${index + 1}. Feedback ID: \`${id}\`

**Status**: ${statusText}
**File**: ${sourceInfo.file}
**Line**: ${sourceInfo.line}
**Component**: ${sourceInfo.component}
${formatElementInfoSimple(sourceInfo.elementInfo)}
**User Request**:
${description}
${notesSection}
${result ? `**Result**: ${result}\n` : ""}---`;
      })
      .join("\n\n");

    const hint = `\n\n## How to Update\n\nUse \`update_inspection_status\` tool to update any inspection:\n\n\`\`\`\nupdate_inspection_status({\n  inspectionId: "feedback-xxx",  // Copy from above\n  status: "completed",\n  message: "Your findings here"\n})\n\`\`\``;

    // Build content array with text + images (MCP spec)
    const content: any[] = [
      {
        type: "text" as const,
        text: `# Inspection Queue (${items.length} items)\n\n${feedbackList}${hint}`,
      },
    ];

    // Add screenshots for each item that has them
    items.forEach((item: any) => {
      if (item.selectedContext?.screenshot) {
        content.push(createImageContent(item.selectedContext.screenshot));
      }
    });

    return { content };
  } catch {
    return createTextContent("# Error\n\nFailed to load inspection items.");
  }
}

// KISS: Reuse formatCopyContext from format.ts for consistent output
function formatResult(sourceInfo: any, description: string, selectedContext?: any) {
  const includeElement = selectedContext?.includeElement !== false;
  const includeStyles = selectedContext?.includeStyles !== false;

  // Build output using shared format function
  let output = formatCopyContext({
    sourceInfo,
    includeElement,
    includeStyles,
    includePageInfo: false,
    feedback: description,
    consoleMessages: selectedContext?.consoleMessages,
    networkRequests: selectedContext?.networkRequests,
    stdioMessages: selectedContext?.stdioMessages,
    relatedElements: sourceInfo.relatedElements,
    relatedElementIds: sourceInfo.relatedElements?.map((_: any, i: number) => i),
    elementNotes: selectedContext?.elementNotes,
  });

  // Add task instructions (MCP-specific)
  output += `

## Your Task
1. Investigate the issue using 'chrome_devtools' tool (check console logs, network requests, performance)
2. Use 'execute_page_script' to query element state if needed
3. Update status with 'update_inspection_status':
   - "in-progress" with progress details while investigating
   - "completed" with findings when done
   - "failed" if unresolvable`;

  // Return content array with text and optional image (MCP spec)
  const content: any[] = [{ type: "text" as const, text: output }];

  // Add screenshot as MCP image content if available
  if (selectedContext?.screenshot) {
    content.push(createImageContent(selectedContext.screenshot));
  }

  return { content };
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
      } catch {
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
    } catch {
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

// Return type uses ReturnType to infer from createClientExecClient
export type McpClientType = ReturnType<typeof createClientExecClient>;

export function useMcp(): { client: McpClientType | null; isClientReady: boolean } {
  const clientRef = useRef<McpClientType | null>(null);
  const [isClientReady, setIsClientReady] = useState(false);

  // Check if automated by chrome devtools, then we have console/network access
  const isAutomated = navigator.webdriver;

  useEffect(() => {
    if (clientRef.current) return;

    // Type cast needed due to SDK version mismatch between @modelcontextprotocol/sdk (^1.20.1)
    // and @mcpc-tech/cmcp which uses @modelcontextprotocol/sdk (^1.15.0).
    // The Client types differ slightly between versions but are functionally compatible.
    const client = createClientExecClient(
      new Client({ name: "inspector", version: "0.1.0" }, { capabilities: { tools: {} } }) as unknown as Parameters<typeof createClientExecClient>[0],
      "inspector",
    );

    // Capture single element (interactive or via selector)
    async function captureElementContext(args: { selector?: string } = {}) {
      const { selector } = args;

      // Automated mode with selector
      if (selector) {
        return new Promise((resolve, reject) => {
          cancelPendingRequest("New automated capture started");
          pendingResolve = resolve;
          pendingReject = reject;

          window.dispatchEvent(new CustomEvent("automated-capture", {
            detail: { selector }
          }));

          setTimeout(() => {
            if (pendingReject === reject) {
              clearPendingRequest();
              reject(new Error("Timeout: Automated capture failed"));
            }
          }, TIMEOUT_MS);
        });
      }

      // Interactive mode - user clicks element
      cancelPendingRequest("New capture request started");
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

    // Capture multiple elements in area (interactive or via containerSelector/bounds)
    async function captureAreaContext(args: { containerSelector?: string; bounds?: { x: number; y: number; width: number; height: number } } = {}) {
      const { containerSelector, bounds } = args;

      // Automated mode with containerSelector or bounds
      if (containerSelector || bounds) {
        return new Promise((resolve, reject) => {
          cancelPendingRequest("New automated capture started");
          pendingResolve = resolve;
          pendingReject = reject;

          window.dispatchEvent(new CustomEvent("automated-capture", {
            detail: { containerSelector, bounds }
          }));

          setTimeout(() => {
            if (pendingReject === reject) {
              clearPendingRequest();
              reject(new Error("Timeout: Automated capture failed"));
            }
          }, TIMEOUT_MS);
        });
      }

      // Interactive mode - user draws rectangle
      cancelPendingRequest("New capture request started");
      window.dispatchEvent(new CustomEvent("activate-area-capture"));

      return new Promise((resolve, reject) => {
        pendingResolve = resolve;
        pendingReject = reject;

        setTimeout(() => {
          if (pendingReject === reject) {
            clearPendingRequest();
            reject(new Error("Timeout: No area selected"));
          }
        }, TIMEOUT_MS);
      });
    }

    // Event handlers
    function handleElementInspected(event: CustomEvent) {
      if (!pendingResolve) return;

      const { inspections } = event.detail;

      // Always expect an array of inspections
      if (!inspections || !Array.isArray(inspections) || inspections.length === 0) {
        pendingReject?.(new Error("No inspections received"));
        clearPendingRequest();
        return;
      }

      // Store the last inspection ID
      const lastInspection = inspections[inspections.length - 1];
      sessionStorage.setItem(INSPECTION_ID_KEY, lastInspection.id);

      // Format all inspections (include selectedContext for image content)
      const results = inspections.map((item: any) =>
        formatResult(item.sourceInfo, item.description, item.selectedContext),
      );

      // Return single result if only one, otherwise combine them
      if (results.length === 1) {
        pendingResolve(results[0]);
      } else {
        const combinedText = inspections
          .map((item: any, index: number) => {
            const { sourceInfo, description } = item;
            return `## Inspection ${index + 1}\n\n**File**: ${sourceInfo.file}:${sourceInfo.line}:${sourceInfo.column}\n**Component**: ${sourceInfo.component}\n\n**User Request**:\n${description}\n\n${formatElementInfoSimple(sourceInfo.elementInfo)}`;
          })
          .join("\n\n---\n\n");

        pendingResolve(
          createTextContent(`# ${inspections.length} Elements Inspected\n\n${combinedText}`),
        );
      }

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

    // A11y tree helpers (defined once, reused)
    const IMPLICIT_ROLES: Record<string, string | ((el: Element) => string)> = {
      'HEADER': 'banner',
      'NAV': 'navigation',
      'MAIN': 'main',
      'ASIDE': 'complementary',
      'FOOTER': 'contentinfo',
      'SECTION': 'region',
      'ARTICLE': 'article',
      'FORM': 'form',
      'BUTTON': 'button',
      'A': (el) => el.hasAttribute('href') ? 'link' : '',
      'IMG': 'img',
      'UL': 'list',
      'OL': 'list',
      'LI': 'listitem',
      'TABLE': 'table',
      'H1': 'heading',
      'H2': 'heading',
      'H3': 'heading',
      'H4': 'heading',
      'H5': 'heading',
      'H6': 'heading',
      'INPUT': (el) => {
        const type = el.getAttribute('type');
        if (type === 'submit' || type === 'button') return 'button';
        if (type === 'checkbox') return 'checkbox';
        if (type === 'radio') return 'radio';
        return 'textbox';
      },
      'TEXTAREA': 'textbox',
      'SELECT': 'combobox',
      'DIALOG': 'dialog',
    };

    const SKIP_TAGS = new Set(['DIV', 'SPAN', 'SCRIPT', 'STYLE', 'NOSCRIPT', 'BR', 'HR']);

    function getImplicitRole(el: Element): string | null {
      const mapping = IMPLICIT_ROLES[el.tagName];
      if (!mapping) return null;
      return typeof mapping === 'function' ? mapping(el) : mapping;
    }

    function getDirectTextContent(el: Element): string {
      let text = '';
      for (let i = 0; i < el.childNodes.length; i++) {
        const node = el.childNodes[i];
        if (node.nodeType === Node.TEXT_NODE) {
          text += node.textContent?.trim() || '';
        }
      }
      return text.slice(0, 50);
    }

    function getA11yTree(element: Element, depth = 0, maxDepth = 4, lines: string[] = []): string[] {
      if (depth > maxDepth || lines.length >= 100) return lines;

      const role = element.getAttribute('role') || getImplicitRole(element);
      const ariaLabel = element.getAttribute('aria-label');
      const hasSemanticMeaning = role || !SKIP_TAGS.has(element.tagName) || element.id || ariaLabel;

      if (hasSemanticMeaning && role !== 'none' && role !== 'presentation') {
        // Compute accessible name
        const ariaLabelledBy = element.getAttribute('aria-labelledby');
        let name = ariaLabel
          || (ariaLabelledBy ? document.getElementById(ariaLabelledBy)?.textContent?.trim() : null)
          || element.getAttribute('alt')
          || element.getAttribute('title')
          || element.getAttribute('placeholder')
          || (element.tagName !== 'INPUT' && element.tagName !== 'TEXTAREA' ? getDirectTextContent(element) : '');

        if (name && name.length > 50) name = name.slice(0, 47) + '...';

        const tag = element.tagName.toLowerCase();
        const id = element.id ? `#${element.id}` : '';
        const roleStr = role && role !== tag ? ` [${role}]` : '';
        const nameStr = name ? `: "${name}"` : '';
        lines.push(`${'  '.repeat(depth)}<${tag}${id}${roleStr}${nameStr}>`);
      }

      for (let i = 0; i < element.children.length && lines.length < 100; i++) {
        getA11yTree(element.children[i], hasSemanticMeaning ? depth + 1 : depth, maxDepth, lines);
      }

      return lines;
    }

    // Get page info implementation
    function getPageInfo() {
      const a11yTree = getA11yTree(document.body);

      const output = `## Page Information
- **URL**: ${window.location.href}
- **Title**: ${document.title}
- **Viewport**: ${window.innerWidth} × ${window.innerHeight}
- **Document Size**: ${document.documentElement.scrollWidth} × ${document.documentElement.scrollHeight}
- **Scroll**: (${window.scrollX}, ${window.scrollY})

## Accessibility Tree
\`\`\`
${a11yTree.length > 0 ? a11yTree.join('\n') : '(empty or no semantic structure)'}
\`\`\`

## Next Steps
- \`capture_element_context({ selector })\` - inspect specific element
- \`capture_area_context({ containerSelector })\` - inspect container's children
- \`capture_area_context({ bounds: {x,y,width,height} })\` - inspect screen region`;

      return createTextContent(output);
    }

    eventHandlers.forEach(({ event, handler }) => {
      window.addEventListener(event, handler as EventListener);
    });

    // Built-in tools (exposed to AI)
    const builtInTools = [
      {
        ...TOOL_SCHEMAS.capture_element_context,
        implementation: captureElementContext,
      },
      {
        ...TOOL_SCHEMAS.capture_area_context,
        implementation: captureAreaContext,
      },
      {
        ...TOOL_SCHEMAS.list_inspections,
        implementation: getAllFeedbacks,
      },
      {
        ...TOOL_SCHEMAS.update_inspection_status,
        implementation: updateInspectionStatus,
      },
      {
        ...TOOL_SCHEMAS.execute_page_script,
        implementation: patchContext,
      },
      {
        ...TOOL_SCHEMAS.get_page_info,
        implementation: getPageInfo,
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
      new URL(`/__mcp__/sse?clientId=inspector&isAutomated=${isAutomated}`, getDevServerBaseUrl()),
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
