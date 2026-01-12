/**
 * Unified shutdown manager for dev-inspector.
 * Ensures all cleanup handlers are executed in order before exit.
 */

type CleanupHandler = () => Promise<void> | void;

const cleanupHandlers: Map<string, CleanupHandler> = new Map();
let isShuttingDown = false;
let registered = false;

/**
 * Register a cleanup handler to be called on shutdown.
 * Handlers are executed in registration order.
 */
export function registerCleanupHandler(name: string, handler: CleanupHandler): void {
  cleanupHandlers.set(name, handler);
  ensureShutdownHooksRegistered();
}

/**
 * Unregister a cleanup handler.
 */
export function unregisterCleanupHandler(name: string): void {
  cleanupHandlers.delete(name);
}

/**
 * Execute all cleanup handlers and exit.
 */
async function executeShutdown(): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  // Execute all handlers in order
  for (const [name, handler] of cleanupHandlers) {
    try {
      await handler();
    } catch (err) {
      console.error(`[dev-inspector] Error in cleanup handler "${name}":`, err);
    }
  }

  cleanupHandlers.clear();
  process.exit(0);
}

function ensureShutdownHooksRegistered(): void {
  if (registered) return;
  registered = true;

  const handleSignal = () => {
    void executeShutdown();
  };

  process.once('SIGINT', handleSignal);
  process.once('SIGTERM', handleSignal);
  process.once('SIGHUP', handleSignal);

  process.once('beforeExit', () => {
    if (!isShuttingDown) {
      void executeShutdown();
    }
  });
}
