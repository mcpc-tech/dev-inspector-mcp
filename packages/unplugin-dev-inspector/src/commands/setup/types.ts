export type BundlerType = "vite" | "webpack" | "nextjs";

export interface SetupOptions {
  dryRun?: boolean;
  configPath?: string;
  bundlerType?: BundlerType;
  entryPath?: string;
  noBackup?: boolean;
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
