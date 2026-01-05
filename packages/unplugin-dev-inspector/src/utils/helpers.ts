/**
 * Simple utility functions following KISS principle
 */

export function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export function isEnvTruthy(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function isChromeDisabled(disableOption?: boolean): boolean {
  // Check environment variable first
  if (isEnvTruthy(process.env.DEV_INSPECTOR_DISABLE_CHROME)) {
    return true;
  }
  // Default to true (Chrome disabled by default)
  return disableOption ?? true;
}

export function getPublicBaseUrl(options?: { publicBaseUrl?: string; host?: string; port?: number }): string {
  const fromEnv = process.env.DEV_INSPECTOR_PUBLIC_BASE_URL;
  if (fromEnv) return stripTrailingSlash(fromEnv);
  
  if (options?.publicBaseUrl) return stripTrailingSlash(options.publicBaseUrl);
  

  const host = options?.host || "localhost";
  const port = options?.port || 5173;
  return `http://${host}:${port}`;
}

/**
 * Recursively substitute environment variables in an object or array.
 * Replaces strings like "{API_KEY}" with the value of process.env.API_KEY.
 * If the environment variable is not defined, the original string is kept.
 */
export function substituteEnvVars(
  value: any,
  env: Record<string, string | undefined> = process.env,
): any {
  if (typeof value === "string") {
    // Match {VAR_NAME} pattern (allow A-Z, a-z, 0-9, _)
    const match = value.match(/^\{([a-zA-Z0-9_]+)\}$/);
    if (match) {
      const varName = match[1];
      const envValue = env[varName];
      if (envValue !== undefined) {
        return envValue;
      }
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => substituteEnvVars(item, env));
  }

  if (typeof value === "object" && value !== null) {
    const result: Record<string, any> = {};
    for (const key in value) {
      // Avoid prototype pollution
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        result[key] = substituteEnvVars(value[key], env);
      }
    }
    return result;
  }

  return value;
}
