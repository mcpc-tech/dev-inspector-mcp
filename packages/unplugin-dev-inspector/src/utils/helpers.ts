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
  return Boolean(disableOption) || isEnvTruthy(process.env.DEV_INSPECTOR_DISABLE_CHROME);
}

export function getPublicBaseUrl(options?: { publicBaseUrl?: string; host?: string; port?: number }): string {
  const fromEnv = process.env.DEV_INSPECTOR_PUBLIC_BASE_URL;
  if (fromEnv) return stripTrailingSlash(fromEnv);
  
  if (options?.publicBaseUrl) return stripTrailingSlash(options.publicBaseUrl);
  
  const host = options?.host || "localhost";
  const port = options?.port || 5173;
  return `http://${host}:${port}`;
}
