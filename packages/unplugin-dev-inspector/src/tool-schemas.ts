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
} as const;
