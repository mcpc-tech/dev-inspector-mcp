import { useEffect } from "react";
import { getSourceInfo } from "../sourceDetector";

interface UseInspectorHoverProps {
  isActive: boolean;
  isWaitingForFeedback: boolean;
  overlayRef: React.RefObject<HTMLDivElement | null>;
  tooltipRef: React.RefObject<HTMLDivElement | null>;
  btnRef: React.RefObject<HTMLButtonElement | null>;
}

export const useInspectorHover = ({
  isActive,
  isWaitingForFeedback,
  overlayRef,
  tooltipRef,
  btnRef,
}: UseInspectorHoverProps) => {
  useEffect(() => {
    if (!isActive || isWaitingForFeedback) return;

    const handleMouseMove = (e: MouseEvent) => {
      const target = e.target as Element;
      if (
        target === btnRef.current ||
        target === overlayRef.current ||
        target === tooltipRef.current
      ) {
        return;
      }

      const rect = target.getBoundingClientRect();
      if (overlayRef.current) {
        overlayRef.current.style.display = "block";
        overlayRef.current.style.top = rect.top + "px";
        overlayRef.current.style.left = rect.left + "px";
        overlayRef.current.style.width = rect.width + "px";
        overlayRef.current.style.height = rect.height + "px";
      }

      if (tooltipRef.current) {
        const info = getSourceInfo(target);
        
        // Simplified content for cleaner look
        const componentName = info.component || target.tagName.toLowerCase();
        const sourceLoc = info.file ? `${info.file.split('/').pop()}:${info.line}` : '';
        
        const sourceText = `
          <div class="flex items-center gap-2">
            <span class="font-bold text-blue-600">${componentName}</span>
            ${sourceLoc ? `<span class="text-slate-400 text-[10px]">${sourceLoc}</span>` : ''}
          </div>
        `;

        tooltipRef.current.innerHTML = sourceText;
        
        // Position logic: prefer top-left, flip if too close to top
        const tooltipHeight = tooltipRef.current.offsetHeight || 32;
        const gap = 4;
        const showAbove = rect.top > (tooltipHeight + gap);

        tooltipRef.current.style.display = "block";
        tooltipRef.current.style.left = rect.left + "px";
        
        if (showAbove) {
             tooltipRef.current.style.top = (rect.top - gap) + "px";
             tooltipRef.current.style.transform = "translateY(-100%)";
             // Optional: Update rounded corners to look "attached" if desired, 
             // but standard rounded is fine.
        } else {
             tooltipRef.current.style.top = (rect.bottom + gap) + "px";
             tooltipRef.current.style.transform = "none";
        }
        
        // Ensure strictly within viewport width
        const tooltipRect = tooltipRef.current.getBoundingClientRect();
        if (tooltipRect.right > window.innerWidth) {
            tooltipRef.current.style.left = (window.innerWidth - tooltipRect.width - 10) + "px";
        }
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    return () => document.removeEventListener("mousemove", handleMouseMove);
  }, [isActive, isWaitingForFeedback, overlayRef, tooltipRef, btnRef]);
};
