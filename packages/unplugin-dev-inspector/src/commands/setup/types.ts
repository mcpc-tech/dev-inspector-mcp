export type BundlerType = "vite" | "webpack" | "nextjs";

export interface SetupOptions {
  dryRun?: boolean;
  configPath?: string;
  bundlerType?: BundlerType;
  entryPath?: string;
  host?: string;
  allowedHosts?: string[];
  noBackup?: boolean;
  updateConfig?: boolean;
  disableChrome?: boolean;
  autoOpenBrowser?: boolean;
  defaultAgent?: string;
  visibleAgents?: string[];
  jsonOptions?: Record<string, any>;
}

export interface TransformResult {
  success: boolean;
  modified: boolean;
  code?: string;
  error?: string;
  message: string;
}

export interface FrameworkSetup {
  bundler: BundlerType;
  detect(cwd: string): string | null;
  transform(code: string, options: SetupOptions): TransformResult;
}
