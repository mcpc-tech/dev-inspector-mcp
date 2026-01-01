import { toPng } from "html-to-image";

/**
 * Capture screenshot of a DOM element
 * @param element - The DOM element to capture
 * @param options - Screenshot options
 * @returns Promise<string> - Data URL of the screenshot, or empty string on error
 */
export async function captureElementScreenshot(
  element: Element,
  options: {
    quality?: number;
    maxWidth?: number;
    maxHeight?: number;
  } = {},
): Promise<string> {
  const { quality = 0.95, maxWidth = 1200, maxHeight = 800 } = options;

  try {
    const rect = element.getBoundingClientRect();
    const scale = Math.min(1, maxWidth / rect.width, maxHeight / rect.height);

    // Capture with explicit dimensions to avoid margin issues
    const dataUrl = await toPng(element as HTMLElement, {
      quality,
      pixelRatio: scale * (window.devicePixelRatio || 1),
      cacheBust: true,
      // Explicitly set dimensions based on bounding rect to avoid capturing margin as white space
      width: rect.width,
      height: rect.height,
      style: {
        // Reset margins during capture to avoid offset issues
        margin: "0",
        // Ensure element stays in position
        transform: "none",
      },
      // Skip elements that cause issues (like iframes, cross-origin elements)
      filter: (node) => {
        if (node instanceof HTMLElement) {
          const tagName = node.tagName.toLowerCase();
          // Skip problematic elements that can cause blank captures or security errors
          if (
            tagName === "iframe" ||
            tagName === "script" ||
            tagName === "link" ||
            tagName === "video" ||
            tagName === "audio" ||
            tagName === "object" ||
            tagName === "embed"
          ) {
            return false;
          }

          // Skip images that might have CORS issues
          if (tagName === "img") {
            const img = node as HTMLImageElement;
            // Skip if image hasn't loaded yet or has error
            if (!img.complete || img.naturalWidth === 0) {
              return false;
            }
          }
        }
        return true;
      },
      // Reduce the likelihood of CORS errors from fonts
      fontEmbedCSS: "",
    });

    return dataUrl;
  } catch (error) {
    console.error("[screenshot] Failed to capture element:", error);
    return "";
  }
}
