/**
 * Shared prompt schemas for MCP inspector prompts
 * Used by both server and client implementations
 */

export const PROMPT_SCHEMAS = {
  capture_element: {
    name: "capture_element",
    title: "Capture Element Context",
    description:
      "Capture context about a UI element for troubleshooting and investigation.",
    arguments: [
      {
        name: "automated",
        description:
          "If true, the AI will automate the capture process (click/feedback/submit).",
        required: false,
      },
    ],
  },

  view_inspections: {
    name: "view_inspections",
    title: "View All Inspections",
    description: "View all element inspections in the queue with their status.",
    arguments: [],
  },

  launch_chrome_devtools: {
    name: "launch_chrome_devtools",
    title: "Launch Chrome DevTools",
    description:
      "Launch Chrome DevTools and navigate to a specified URL for debugging and inspection.",
    arguments: [
      {
        name: "url",
        description: "The URL to navigate to (e.g., http://localhost:3000)",
        required: true,
      },
    ],
  },

  get_network_requests: {
    name: "get_network_requests",
    title: "Get Network Requests",
    description:
      "List network requests or get details of a specific one. Always refreshes the list first.",
    // Arguments will be dynamically populated based on available requests
    arguments: [],
  },

  get_console_messages: {
    name: "get_console_messages",
    title: "Get Console Messages",
    description:
      "List console messages or get details of a specific one. Always refreshes the list first.",
    // Arguments will be dynamically populated based on available messages
    arguments: [],
  },

  get_stdio_messages: {
    name: "get_stdio_messages",
    title: "Get Stdio Messages",
    description:
      "List stdio (stdout/stderr) messages from the server process. Always refreshes the list first.",
    // Arguments will be dynamically populated based on available messages
    arguments: [],
  },
} as const;
