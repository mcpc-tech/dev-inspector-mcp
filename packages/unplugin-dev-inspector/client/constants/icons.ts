// Agent icons - imported as raw SVG strings for bundling
import claudeIcon from "./icons/claude-color.svg?raw";
import openaiIcon from "./icons/openai.svg?raw";
import geminiIcon from "./icons/gemini-color.svg?raw";
import moonshotIcon from "./icons/moonshot.svg?raw";
import gooseIcon from "./icons/goose.svg?raw";
import cursorIcon from "./icons/cursor.svg?raw";
import codebuddyIcon from "./icons/codebuddy.svg?raw";
import droidIcon from "./icons/droid.svg?raw";
import githubcopilotIcon from "./icons/githubcopilot.svg?raw";
// PNG icons - imported as base64 data URI
import opencodeIcon from "./icons/opencode.png?png";

export const AGENT_ICONS = {
  claude: claudeIcon,
  openai: openaiIcon,
  gemini: geminiIcon,
  moonshot: moonshotIcon,
  goose: gooseIcon,
  cursor: cursorIcon,
  droid: droidIcon,
  githubcopilot: githubcopilotIcon,
  opencode: opencodeIcon, // Already a data URI
  codebuddy: codebuddyIcon,
} as const;

// Convert raw SVG to data URI for use in img src
export function svgToDataUri(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
