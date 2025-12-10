import React from "react";
import { cn } from "../lib/utils";
import { Bot } from "lucide-react";

interface AcpAgentButtonProps {
  isActive: boolean;
  onClick: (e: React.MouseEvent) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export const AcpAgentButton = React.forwardRef<HTMLButtonElement, AcpAgentButtonProps>(
  ({ isActive, onClick, onMouseEnter, onMouseLeave }, ref) => (
    <button
      ref={ref}
      id="acp-agent-btn"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      title="Toggle AI Agent Panel"
      className={cn(
        "w-10 h-10 rounded-full bg-gradient-to-br from-purple-600 via-purple-700 to-indigo-700 border-0 cursor-pointer shadow-lg z-[999998]",
        "flex items-center justify-center transition-all duration-300 ease-out outline-none",
        "hover:scale-110 hover:shadow-xl hover:from-purple-700 hover:via-purple-800 hover:to-indigo-800",
        isActive && "scale-110 shadow-xl from-purple-700 via-purple-800 to-indigo-800",
      )}
    >
      <Bot className="w-5 h-5 text-white" />
    </button>
  ),
);

AcpAgentButton.displayName = "AcpAgentButton";
