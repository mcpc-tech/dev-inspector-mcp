import React from "react";
import { cn } from "../lib/utils";

interface OverlayProps {
  visible: boolean;
}

export const Overlay = React.forwardRef<HTMLDivElement, OverlayProps>(({ visible }, ref) => (
  <div
    ref={ref}
    className={cn(
      "fixed pointer-events-none border-2 border-blue-500 bg-blue-500/10 z-[999997]",
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
      "fixed bg-white text-slate-700 py-2 px-3 rounded-md text-xs z-[999999]",
      "pointer-events-none shadow-xl font-medium border border-blue-500",
      visible ? "block" : "hidden",
    )}
  />
));

Tooltip.displayName = "Tooltip";
