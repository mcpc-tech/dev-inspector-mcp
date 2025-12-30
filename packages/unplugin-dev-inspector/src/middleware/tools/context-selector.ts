import { tool } from "ai";
import { z } from "zod";

/**
 * Context selector tool schema - used by AI to select relevant context items
 */
export const contextSelectorSchema = z.object({
  consoleIds: z
    .array(z.number())
    .optional()
    .describe("IDs of relevant console messages to include"),
  networkIds: z
    .array(z.number())
    .optional()
    .describe("IDs of relevant network requests to include"),
  includeElement: z
    .boolean()
    .optional()
    .describe("Whether to include the source element info (HTML/tag)"),
  includeStyles: z.boolean().optional().describe("Whether to include the computed styles"),
  reasoning: z
    .string()
    .optional()
    .describe("Brief explanation of why these items are relevant and what has been selected"),
});

export const contextSelectorTool = tool({
  description:
    "Select relevant console messages and network requests based on the source context. Call this tool with the IDs of items you think are relevant to the inspected element.",
  inputSchema: contextSelectorSchema,
  execute: async () => {
    // Return args so client can see them in tool result if needed,
    // though client mainly listens for the tool call itself.
    return `Selected`;
  },
});
