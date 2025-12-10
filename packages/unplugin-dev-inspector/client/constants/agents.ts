import { AGENT_ICONS, svgToDataUri } from "./icons";
import type { Agent } from "./types";

export type { Agent };

export const AVAILABLE_AGENTS: Agent[] = [
  {
    name: "Claude Code",
    command: "npx",
    args: ["-y", "@zed-industries/claude-code-acp"],
    env: [
      { key: "ANTHROPIC_API_KEY", required: false },
      { key: "ANTHROPIC_BASE_URL", required: false },
    ],
    meta: {
      icon: svgToDataUri(AGENT_ICONS.claude),
    },
  },
  {
    name: "Codex CLI",
    command: "npx",
    args: ["-y", "@zed-industries/codex-acp"],
    env: [{ key: "AI_GATEWAY_API_KEY", required: false }],
    meta: {
      icon: svgToDataUri(AGENT_ICONS.openai),
    },
  },
  {
    name: "Gemini CLI",
    command: "npx",
    args: ["@google/gemini-cli", "--experimental-acp"],
    env: [{ key: "GEMINI_API_KEY", required: false }],
    authMethodId: "gemini-api-key",
    meta: {
      icon: svgToDataUri(AGENT_ICONS.gemini),
    },
  },
  {
    name: "Kimi CLI",
    command: "kimi",
    args: ["--acp"],
    env: [],
    meta: {
      icon: svgToDataUri(AGENT_ICONS.moonshot),
    },
  },
  {
    name: "Goose",
    command: "goose",
    args: ["acp"],
    env: [],
    meta: {
      icon: svgToDataUri(AGENT_ICONS.goose),
    },
  },
  {
    name: "Opencode",
    command: "npx",
    args: ["-y", "opencode-ai", "acp"],
    env: [],
    meta: {
      icon: AGENT_ICONS.opencode, // PNG already a data URI
    },
  },
  {
    name: "Cursor Agent",
    command: "npx",
    args: ["cursor-agent-acp"],
    env: [],
    meta: {
      icon: svgToDataUri(AGENT_ICONS.cursor),
    },
  },
  {
    name: "CodeBuddy Code",
    command: "npx",
    args: ["-y", "@tencent-ai/codebuddy-code", "--acp"],
    env: [
      { key: "CODEBUDDY_API_KEY", required: false },
      {
        key: "CODEBUDDY_INTERNET_ENVIRONMENT",
        required: false,
      },
    ],
    meta: {
      icon: svgToDataUri(AGENT_ICONS.codebuddy),
    },
    // Delay to ensure mcp server is ready
    acpDelay: 2000,
  },
];

export const DEFAULT_AGENT = "Claude Code";
