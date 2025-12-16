// Simplified agent list for Dynamic Island
// KISS: Just the essential agents

export interface Agent {
  name: string;
  command: string;
  args?: string[];
  npmPackage?: string;
  npmArgs?: string[];
  icon?: string;
}

export const AGENTS: Agent[] = [
  {
    name: 'Claude Code',
    command: 'npx',
    args: ['-y', '@zed-industries/claude-code-acp'],
    npmPackage: '@zed-industries/claude-code-acp',
    npmArgs: [],
    icon: '🤖',
  },
  {
    name: 'Gemini CLI',
    command: 'gemini',
    args: ['--experimental-acp'],
    icon: '✨',
  },
  {
    name: 'Codex CLI',
    command: 'npx',
    args: ['-y', '@zed-industries/codex-acp'],
    npmPackage: '@zed-industries/codex-acp',
    npmArgs: [],
    icon: '🔮',
  },
];

export const DEFAULT_AGENT = AGENTS[0];
