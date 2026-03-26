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
    configHint: "Anthropic's official CLI agent via Zed adapter",
    configLink: "https://github.com/zed-industries/claude-code-acp",
    npmPackage: "@zed-industries/claude-code-acp",
    npmArgs: [],
    meta: {
      icon: svgToDataUri(AGENT_ICONS.claude),
    },
  },
  {
    name: "Codex CLI",
    command: "npx",
    args: ["-y", "@zed-industries/codex-acp"],
    env: [{ key: "OPENAI_API_KEY", required: false }],
    configHint: "OpenAI Codex CLI via Zed adapter",
    configLink: "https://github.com/zed-industries/codex-acp",
    npmPackage: "@zed-industries/codex-acp",
    npmArgs: [],
    meta: {
      icon: svgToDataUri(AGENT_ICONS.openai),
    },
  },
  {
    name: "GitHub Copilot",
    command: "copilot",
    args: ["--acp"],
    env: [],
    configHint: "GitHub's AI coding assistant with ACP support",
    configLink: "https://github.com/github/copilot",
    installCommand: "npm install -g @github/copilot@0.0.392",
    meta: {
      icon: svgToDataUri(AGENT_ICONS.githubcopilot),
    },
  },
  {
    name: "Gemini CLI",
    command: "gemini",
    args: ["--experimental-acp"],
    env: [{ key: "GEMINI_API_KEY", required: false }],
    authMethodId: "gemini-api-key",
    configHint: "Official Google Gemini CLI with ACP support",
    configLink: "https://github.com/google-gemini/gemini-cli",
    meta: {
      icon: svgToDataUri(AGENT_ICONS.gemini),
    },
  },
  {
    name: "Kimi CLI",
    command: "kimi",
    args: ["--acp"],
    env: [],
    configHint: "Moonshot AI's CLI with built-in ACP support",
    configLink: "https://github.com/MoonshotAI/kimi-cli",
    installCommand: "uv tool install --python 3.13 kimi-cli",
    meta: {
      icon: svgToDataUri(AGENT_ICONS.moonshot),
    },
  },
  {
    name: "Goose",
    command: "goose",
    args: ["acp"],
    env: [],
    configHint: "Block's open-source agent with ACP support",
    configLink: "https://block.github.io/goose/docs/guides/acp-clients",
    installCommand: "pipx install goose-ai",
    meta: {
      icon: svgToDataUri(AGENT_ICONS.goose),
    },
  },
  {
    name: "Opencode",
    command: "opencode",
    args: ["acp"],
    env: [],
    configHint: "SST's open source agent with ACP support",
    configLink: "https://github.com/sst/opencode",
    meta: {
      icon: AGENT_ICONS.opencode, // PNG already a data URI
    },
  },
  {
    name: "Cursor Agent",
    command: "cursor",
    args: ["agent", "acp"],
    env: [],
    configHint: "Cursor's AI agent with native ACP support",
    configLink: "https://cursor.com/docs/cli/acp",
    meta: {
      icon: svgToDataUri(AGENT_ICONS.cursor),
    },
  },
  {
    name: "Droid",
    command: "droid",
    args: ["exec", "--output-format", "acp"],
    env: [{ key: "FACTORY_API_KEY", required: false }],
    configHint: "Factory's AI coding agent with native ACP support",
    configLink: "https://docs.factory.ai/droid/overview",
    meta: {
      icon: svgToDataUri(AGENT_ICONS.droid),
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
      {
        key: "CODEBUDDY_DEFER_TOOL_LOADING",
        required: true,
        default: "false",
      },
    ],
    configHint: "Tencent Cloud's coding assistant",
    configLink: "https://copilot.tencent.com/docs/cli/acp",
    npmPackage: "@tencent-ai/codebuddy-code",
    npmArgs: [],
    meta: {
      icon: svgToDataUri(AGENT_ICONS.codebuddy),
    },
  },
];

export const DEFAULT_AGENT = "Claude Code";
