"use client";

import { useEffect } from "react";

interface DevInspectorProps {
    host?: string;
    port?: string | number;
}

export function DevInspector({ host = "localhost", port = "8888" }: DevInspectorProps) {
    useEffect(() => {
        if (typeof window === "undefined") return;
        if ((window as any).__DEV_INSPECTOR_LOADED__) return;
        (window as any).__DEV_INSPECTOR_LOADED__ = true;

        const inspector = document.createElement("dev-inspector-mcp");
        document.body.appendChild(inspector);

        (window as any).__DEV_INSPECTOR_CONFIG__ = { host, port: String(port), base: "/" };

        const script = document.createElement("script");
        script.src = `http://${host}:${port}/__inspector__/inspector.iife.js`;
        script.type = "module";
        document.head.appendChild(script);
    }, [host, port]);

    return null;
}

export default DevInspector;
