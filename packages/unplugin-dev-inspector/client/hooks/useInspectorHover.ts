import { useEffect } from "react";

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
        tooltipRef.current.style.display = "block";
        tooltipRef.current.style.top = e.clientY + 10 + "px";
        tooltipRef.current.style.left = e.clientX + 10 + "px";
        tooltipRef.current.textContent = "Click to inspect";
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    return () => document.removeEventListener("mousemove", handleMouseMove);
  }, [isActive, isWaitingForFeedback, overlayRef, tooltipRef, btnRef]);
};
