import { existsSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";

const LOG_PREFIX = "[dev-inspector] ";
const HOME_DIR = homedir();

export type EditorId = 'cursor' | 'vscode' | 'windsurf' | 'claude-code' | 'antigravity';

export interface CustomEditorConfig {
  id: string;
  name: string;
  /** Path to config directory (absolute, ~/relative, or project-relative) */
  configPath: string;
  configFileName: string;
  /** @default 'url' */
  serverUrlKey?: string;
  /** @default 'mcpServers' */
  configFormat?: 'servers' | 'mcpServers';
}

export interface McpConfigOptions {
  /**
   * Auto-update MCP config for editors
   * - `true` or `'auto'`: Auto-detect editors
   * - `false`: Disable
   * - `EditorId[]`: Specific editors only
   * @default true
   */
  updateConfig?: boolean | 'auto' | EditorId[];
  /** @default 'dev-inspector' */
  updateConfigServerName?: string;
  updateConfigAdditionalServers?: Array<{ name: string; url: string }>;
  customEditors?: CustomEditorConfig[];
}

// Built-in editor configs
const EDITORS: Record<EditorId, { name: string; path: string; file: string; urlKey: string; format: 'servers' | 'mcpServers' }> = {
  cursor: { name: 'Cursor', path: '.cursor', file: 'mcp.json', urlKey: 'url', format: 'mcpServers' },
  vscode: { name: 'VSCode', path: '.vscode', file: 'mcp.json', urlKey: 'url', format: 'servers' },
  windsurf: { name: 'Windsurf', path: join(HOME_DIR, '.codeium', 'windsurf'), file: 'mcp_config.json', urlKey: 'serverUrl', format: 'mcpServers' },
  'claude-code': { name: 'Claude Code', path: '.', file: '.mcp.json', urlKey: 'url', format: 'mcpServers' },
  antigravity: { name: 'Antigravity', path: join(HOME_DIR, '.gemini', 'antigravity'), file: 'mcp.json', urlKey: 'url', format: 'servers' },
};

function resolvePath(path: string, root: string): string {
  if (path.startsWith('/')) return path;
  if (path.startsWith('~')) return join(HOME_DIR, path.slice(1));
  return join(root, path);
}

/** Find directory by walking up from root (for monorepo support) */
function findUpDir(name: string, from: string): string | null {
  let dir = from;
  while (dir !== '/') {
    const target = join(dir, name);
    if (existsSync(target)) return target;
    dir = join(dir, '..');
  }
  return null;
}

function detectEditors(root: string): EditorId[] {
  return (Object.keys(EDITORS) as EditorId[]).filter(id => {
    const editor = EDITORS[id];
    // Global paths (windsurf) - check if directory exists
    if (editor.path.startsWith('/')) {
      return existsSync(editor.path);
    }
    // Relative paths - walk up to find (monorepo support)
    const found = findUpDir(editor.path, root);
    if (!found) {
      // For cursor/vscode, always create config in project root if not found
      // This allows users to get MCP config without manually creating the directory first
      if (id === 'cursor' || id === 'vscode') return true;
      // For antigravity, check if the global config directory exists
      if (id === 'antigravity') return existsSync(editor.path);
      return false;
    }
    // For claude-code, check if file exists (not just dir)
    return id === 'claude-code' ? existsSync(join(found, editor.file)) : true;
  });
}

/** Find project root by looking for workspace markers */
function findProjectRoot(from: string): string {
  let dir = from;
  while (dir !== '/') {
    if (existsSync(join(dir, '.git')) || 
        existsSync(join(dir, 'pnpm-workspace.yaml')) ||
        existsSync(join(dir, 'package.json'))) {
      return dir;
    }
    dir = join(dir, '..');
  }
  return from;
}

/** Get config path, walking up for relative paths */
function getConfigPath(id: EditorId, root: string): string {
  const editor = EDITORS[id];
  if (editor.path.startsWith('/')) {
    return join(editor.path, editor.file);
  }
  
  // For VSCode and Cursor, always use the project root
  if (id === 'vscode' || id === 'cursor') {
    const projectRoot = findProjectRoot(root);
    return join(projectRoot, editor.path, editor.file);
  }
  
  const found = findUpDir(editor.path, root);
  return join(found || join(root, editor.path), editor.file);
}

function stripJsonComments(content: string): string {
  return content
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .trim();
}

function parseConfigFile(content: string): Record<string, any> {
  try {
    return JSON.parse(stripJsonComments(content));
  } catch {
    return {};
  }
}

function getExistingUrl(config: Record<string, any>, key: string, serverName: string, urlKey: string, format: string): string | undefined {
  if (!config[key]?.[serverName]) return undefined;
  return format === 'servers' ? config[key][serverName]?.url : config[key][serverName]?.[urlKey];
}

function addServerToConfig(config: Record<string, any>, key: string, serverName: string, sseUrl: string, urlKey: string, format: string): void {
  if (format === 'servers') {
    config[key][serverName] = { type: 'sse', url: sseUrl };
  } else {
    config[key][serverName] = { [urlKey]: sseUrl };
  }
}

async function writeConfig(
  configPath: string,
  serverName: string,
  baseUrl: string,
  clientId: string,
  urlKey: string,
  format: 'servers' | 'mcpServers',
  additionalServers: Array<{ name: string; url: string }>,
): Promise<boolean> {
  await mkdir(configPath.substring(0, configPath.lastIndexOf('/')), { recursive: true });

  const sseUrl = `${baseUrl}?clientId=${clientId}&puppetId=inspector`;
  const key = format === 'servers' ? 'servers' : 'mcpServers';

  let config: Record<string, any> = {};
  if (existsSync(configPath)) {
    try {
      const content = await readFile(configPath, 'utf-8');
      config = parseConfigFile(content);
    } catch {
      console.warn(`${LOG_PREFIX}Could not parse ${configPath}, starting fresh`);
    }
  }

  config[key] ||= {};

  const existingUrl = getExistingUrl(config, key, serverName, urlKey, format);
  if (existingUrl === sseUrl) {
    return false;
  }

  addServerToConfig(config, key, serverName, sseUrl, urlKey, format);
  additionalServers.forEach(s => addServerToConfig(config, key, s.name, s.url, urlKey, format));

  await writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  return true;
}

export async function updateMcpConfigs(
  root: string,
  sseUrl: string,
  options: McpConfigOptions,
  logger?: { info?: (msg: string) => void; error?: (msg: string) => void },
): Promise<void> {
  const log = logger || console;
  const {
    updateConfig = true,
    updateConfigServerName = 'dev-inspector',
    updateConfigAdditionalServers = [],
    customEditors = [],
  } = options;

  if (updateConfig === false) return;

  // Get editors to update
  const editorIds = updateConfig === true || updateConfig === 'auto'
    ? detectEditors(root)
    : Array.isArray(updateConfig) ? updateConfig : [];

  const updated: string[] = [];
  const updates: Array<{ name: string; path: string }> = [];

  // Update built-in editors
  for (const id of editorIds) {
    const editor = EDITORS[id];
    const configPath = getConfigPath(id, root);
    try {
      const wasUpdated = await writeConfig(configPath, updateConfigServerName, sseUrl, id, editor.urlKey, editor.format, updateConfigAdditionalServers);
      if (wasUpdated) {
        updates.push({ name: editor.name, path: configPath });
        updated.push(id);
      }
    } catch (e) {
      log.error?.(`${LOG_PREFIX}Failed to update ${configPath}: ${e}`);
    }
  }

  // Update custom editors
  for (const custom of customEditors) {
    const configPath = join(resolvePath(custom.configPath, root), custom.configFileName);
    try {
      const wasUpdated = await writeConfig(configPath, updateConfigServerName, sseUrl, custom.id, custom.serverUrlKey || 'url', custom.configFormat || 'mcpServers', updateConfigAdditionalServers);
      if (wasUpdated) {
        updates.push({ name: custom.name, path: configPath });
        updated.push(custom.id);
      }
    } catch (e) {
      log.error?.(`${LOG_PREFIX}Failed to update ${configPath}: ${e}`);
    }
  }

  if (updated.length > 0) {
    const updateMessages = updates.map(u => `Updated ${u.name}: ${u.path}`).join(', ');
    log.info?.(`${LOG_PREFIX}${updateMessages}`);
  }
}
