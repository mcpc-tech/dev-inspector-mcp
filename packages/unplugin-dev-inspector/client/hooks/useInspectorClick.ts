import { useEffect } from "react";
import { getSourceInfo } from "../sourceDetector";
import type { InspectedElement } from "../types";

interface UseInspectorClickProps {
  isActive: boolean;
  isWaitingForFeedback: boolean;
  onElementInspected: (info: InspectedElement, element: Element) => void;
  btnRef: React.RefObject<HTMLButtonElement | null>;
}

export const useInspectorClick = ({
  isActive,
  isWaitingForFeedback,
  onElementInspected,
  btnRef,
}: UseInspectorClickProps) => {
  useEffect(() => {
    if (!isActive || isWaitingForFeedback) return;

    const handleClick = (e: MouseEvent) => {
      if (e.target === btnRef.current) return;

      e.preventDefault();
      e.stopPropagation();

      const info = getSourceInfo(e.target as Element);
      onElementInspected(info, e.target as Element);
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [isActive, isWaitingForFeedback, onElementInspected, btnRef]);
};
