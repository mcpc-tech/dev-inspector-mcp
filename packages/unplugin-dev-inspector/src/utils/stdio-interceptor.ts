import { addStdioLog } from "./log-storage";

type WriteFn = typeof process.stdout.write;

let originalStdoutWrite: WriteFn | null = null;
let originalStderrWrite: WriteFn | null = null;
let isIntercepting = false;

function toText(chunk: unknown): string {
    return typeof chunk === "string" ? chunk : String(chunk);
}

function wrapWrite(stream: "stdout" | "stderr", original: WriteFn): WriteFn {
    return ((chunk: unknown, ...args: unknown[]) => {
        try {
            addStdioLog(stream, toText(chunk));
        } catch {
            // Never break stdout/stderr writes.
        }

        return original(chunk as any, ...(args as any));
    }) as WriteFn;
}

/**
 * Initialize stdio interception
 * Hooks into process.stdout.write and process.stderr.write
 */
export function initStdioInterceptor() {
  if (isIntercepting) return;

  originalStdoutWrite = process.stdout.write.bind(process.stdout);
  originalStderrWrite = process.stderr.write.bind(process.stderr);

  process.stdout.write = wrapWrite("stdout", originalStdoutWrite);
  process.stderr.write = wrapWrite("stderr", originalStderrWrite);

  isIntercepting = true;
}

/**
 * Cleanup stdio interception
 * Restores original write methods
 */
export function cleanupStdioInterceptor() {
  if (!isIntercepting) return;

  if (originalStdoutWrite) process.stdout.write = originalStdoutWrite;
  if (originalStderrWrite) process.stderr.write = originalStderrWrite;

  originalStdoutWrite = null;
  originalStderrWrite = null;
  isIntercepting = false;
}
