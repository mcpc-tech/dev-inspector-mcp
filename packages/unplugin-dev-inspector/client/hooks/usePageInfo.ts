import { useState, useEffect } from "react";
import type { PageInfo } from "../types";

/**
 * Hook to capture current page information
 * KISS: Captures only essential page context (URL, title, viewport, language)
 */
export function usePageInfo(): PageInfo | null {
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null);

  useEffect(() => {
    const capturePageInfo = (): PageInfo => ({
      url: window.location.href,
      title: document.title,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      language: document.documentElement.lang || navigator.language,
    });

    setPageInfo(capturePageInfo());

    // Update on viewport resize
    const handleResize = () => setPageInfo(capturePageInfo());
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return pageInfo;
}
