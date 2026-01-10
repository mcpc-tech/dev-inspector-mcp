/**
 * Shared tool schemas for MCP inspector tools
 * Used by both server and client implementations
 */

export const TOOL_SCHEMAS = {
  capture_element_context: {
    name: "capture_element_context",
    description: `Capture element context for troubleshooting. 

**Default (automated=false)**: Manual mode - activates visual selector for user interaction.

**Automated (automated=true)**: AI controls capture by clicking elements programmatically. Only set to true when user needs automation.

Returns: source location, DOM hierarchy, computed styles, dimensions, and user notes. Use \`list_inspections\` to view all captured elements.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        automated: {
          type: "boolean",
          description:
            "Set to true ONLY when user explicitly requests automated capture. Default is false (manual mode).",
        },
      },
    },
  },

  list_inspections: {
    name: "list_inspections",
    description:
      "List all captured inspections with ID, element details, source location, notes, and status (pending/in-progress/completed/failed). Use with chrome_devtools for additional context (Console.getMessages, Network.getHAR, Performance.getMetrics).",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },

  update_inspection_status: {
    name: "update_inspection_status",
    description:
      "Update inspection status with optional progress tracking.\n\n**Parameters**:\n- inspectionId: Optional (auto-detects if omitted)\n- status: 'in-progress' | 'completed' | 'failed' | 'deleted'\n- progress: Optional steps array [{id, title, status}]\n- message: REQUIRED for 'completed'/'failed' status\n\n**Example**:\n```javascript\nupdate_inspection_status({\n  status: 'completed',\n  message: 'Fixed: pointer-events: none blocking clicks'\n});\n// Or delete an inspection\nupdate_inspection_status({\n  status: 'deleted'\n});\n```",
    inputSchema: {
      type: "object" as const,
      properties: {
        inspectionId: {
          type: "string",
          description:
            "Optional inspection ID. If not provided, uses the current active inspection.",
        },
        status: {
          type: "string",
          enum: ["in-progress", "completed", "failed", "deleted"],
          description:
            "Current status: 'in-progress' for updates, 'completed' when resolved, 'failed' if unresolvable, 'deleted' to remove inspection",
        },
        progress: {
          type: "object",
          properties: {
            steps: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "number" },
                  title: { type: "string" },
                  status: {
                    type: "string",
                    enum: ["pending", "in-progress", "completed", "failed"],
                  },
                },
                required: ["id", "title", "status"],
              },
            },
          },
          description: "Optional step-by-step progress tracking",
        },
        message: {
          type: "string",
          description:
            "Summary of findings or resolution. REQUIRED when status is 'completed' or 'failed'",
        },
      },
      required: ["status"] as string[],
    },
  },

  execute_page_script: {
    name: "execute_page_script",
    description:
      "Execute JavaScript in browser context (synchronous only, must return value). Access: window, document, DOM APIs, React/Vue instances, localStorage. For deeper diagnostics, use chrome_devtools MCP (Network.getHAR, Console.getMessages, Performance.getMetrics, Debugger, HeapProfiler).",
    inputSchema: {
      type: "object" as const,
      properties: {
        code: {
          type: "string",
          description:
            "JavaScript code to execute in page context. Must return a value for diagnostic output.",
        },
      },
      required: ["code"] as string[],
    },
  },

  capture_area_context: {
    name: "capture_area_context",
    description: `Capture area context by activating visual area selection mode.

User draws a rectangle on the page to select multiple elements at once. After selection, returns context for all elements in the area including source locations, DOM info, and screenshot.

**Flow**: 
1. Activates area selection mode (user sees crosshair cursor)
2. User draws rectangle around target elements
3. Returns: primary element + related elements with source locations, DOM hierarchy, and screenshot`,
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },

  get_network_requests: {
    name: "get_network_requests",
    description: `Get network requests from browser for debugging.

Returns list of HTTP requests with ID, method, URL, and status code. Use reqid parameter to get full details of a specific request including headers, body, and timing.

**Usage**:
- Call without parameters to list all requests
- Call with reqid to get specific request details`,
    inputSchema: {
      type: "object" as const,
      properties: {
        reqid: {
          type: "number",
          description:
            "Optional. Request ID to get full details. If omitted, returns list of all requests.",
        },
      },
    },
  },

  get_console_messages: {
    name: "get_console_messages",
    description: `Get console messages from browser for debugging.

Returns list of console logs with ID, level (log/warn/error/info), and message content. Use msgid parameter to get full details of a specific message.

**Usage**:
- Call without parameters to list all messages
- Call with msgid to get specific message details`,
    inputSchema: {
      type: "object" as const,
      properties: {
        msgid: {
          type: "number",
          description:
            "Optional. Message ID to get full details. If omitted, returns list of all messages.",
        },
      },
    },
  },

  get_stdio_messages: {
    name: "get_stdio_messages",
    description: `Get stdio (stdout/stderr) terminal messages from dev server process.

Returns list of terminal output with ID, stream type (stdout/stderr), and content. Use stdioid parameter to get full details of a specific message.

**Usage**:
- Call without parameters to list all stdio messages
- Call with stdioid to get specific message details`,
    inputSchema: {
      type: "object" as const,
      properties: {
        stdioid: {
          type: "number",
          description:
            "Optional. Stdio message ID to get full details. If omitted, returns list of all messages.",
        },
      },
    },
  },
} as const;
