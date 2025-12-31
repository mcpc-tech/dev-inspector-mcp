import React from "react";
import { cn } from "../lib/utils";

interface OverlayProps {
  visible: boolean;
}

export const Overlay = React.forwardRef<HTMLDivElement, OverlayProps>(({ visible }, ref) => (
  <div
    ref={ref}
    className={cn(
      "fixed pointer-events-none border-2 border-black dark:border-blue-500 bg-black/[0.06] dark:bg-blue-500/10 z-[999997]",
      visible ? "block" : "hidden",
    )}
  />
));

Overlay.displayName = "Overlay";

interface TooltipProps {
  visible: boolean;
}

export const Tooltip = React.forwardRef<HTMLDivElement, TooltipProps>(({ visible }, ref) => (
  <div
    ref={ref}
    className={cn(
      "fixed bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 py-2.5 px-3.5 rounded-lg text-xs z-[999999]",
      "pointer-events-none shadow-lg font-medium border border-transparent dark:border-gray-300",
      visible ? "block" : "hidden",
    )}
  />
));

Tooltip.displayName = "Tooltip";
