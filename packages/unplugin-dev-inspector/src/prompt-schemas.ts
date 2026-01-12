/**
 * Shared prompt schemas for MCP inspector prompts
 * Used by both server and client implementations
 */

export const PROMPT_SCHEMAS = {
  capture_element_context: {
    name: "capture_element_context",
    title: "Capture Element",
    description:
      "Capture single element context. Interactive (user clicks) or automated (selector param).",
    arguments: [
      {
        name: "selector",
        description: "CSS selector for automated capture (no user interaction).",
        required: false,
      },
    ],
  },

  capture_area_context: {
    name: "capture_area_context",
    title: "Capture Area",
    description:
      "Capture multiple elements in area. Interactive (user draws rectangle) or automated (containerSelector/bounds param).",
    arguments: [
      {
        name: "containerSelector",
        description: "CSS selector for container - captures all child elements.",
        required: false,
      },
    ],
  },

  list_inspections: {
    name: "list_inspections",
    title: "List All Inspections",
    description: "List all element inspections in the queue with their status.",
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
    arguments: [],
  },

  get_console_messages: {
    name: "get_console_messages",
    title: "Get Console Messages",
    description:
      "List console messages or get details of a specific one. Always refreshes the list first.",
    arguments: [],
  },

  get_stdio_messages: {
    name: "get_stdio_messages",
    title: "Get Stdio Messages",
    description:
      "List stdio (stdout/stderr) messages from the server process. Always refreshes the list first.",
    arguments: [],
  },
} as const;
