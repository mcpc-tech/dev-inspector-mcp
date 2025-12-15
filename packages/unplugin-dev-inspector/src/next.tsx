"use client";

import { useEffect } from "react";

interface DevInspectorProps {
  host?: string;
  port?: string | number;
  /**
   * Full public reachable base URL including protocol.
   * If provided, it overrides host/port and will be used for loading inspector assets and API calls.
   * @example "https://your-domain.com"
   */
  baseUrl?: string;
}

export function DevInspector({ host = "localhost", port = "8888", baseUrl }: DevInspectorProps) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if ((window as any).__DEV_INSPECTOR_LOADED__) return;
    (window as any).__DEV_INSPECTOR_LOADED__ = true;

    const inspector = document.createElement("dev-inspector-mcp");
    document.body.appendChild(inspector);

    (window as any).__DEV_INSPECTOR_CONFIG__ = {
      host,
      port: String(port),
      base: "/",
      baseUrl: baseUrl,
    };

    const resolvedBaseUrl = (baseUrl || `http://${host}:${port}`).replace(/\/$/, "");

    const script = document.createElement("script");
    script.src = `${resolvedBaseUrl}/__inspector__/inspector.iife.js`;
    script.type = "module";
    document.head.appendChild(script);
  }, [host, port, baseUrl]);

  return null;
}

export default DevInspector;
