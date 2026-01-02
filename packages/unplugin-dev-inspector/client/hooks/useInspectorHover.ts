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
        
        // Securely create content using DOM API to prevent XSS
        tooltipRef.current.replaceChildren();
        
        const container = document.createElement('div');
        container.className = "flex items-center gap-2";
        
        const nameSpan = document.createElement('span');
        nameSpan.className = "font-bold text-blue-600";
        nameSpan.textContent = componentName;
        container.appendChild(nameSpan);
        
        if (sourceLoc) {
             const locSpan = document.createElement('span');
             locSpan.className = "text-slate-400 text-[10px]";
             locSpan.textContent = sourceLoc;
             container.appendChild(locSpan);
        }
        
        tooltipRef.current.appendChild(container);
        
        // Ensure visible before measuring
        tooltipRef.current.style.display = "block";
        
        // Position logic: prefer top-left, flip if too close to top
        const tooltipHeight = tooltipRef.current.offsetHeight;
        const gap = 4;
        const showAbove = rect.top > (tooltipHeight + gap);

        tooltipRef.current.style.left = rect.left + "px";
        
        if (showAbove) {
             tooltipRef.current.style.top = (rect.top - gap) + "px";
             tooltipRef.current.style.transform = "translateY(-100%)";
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
