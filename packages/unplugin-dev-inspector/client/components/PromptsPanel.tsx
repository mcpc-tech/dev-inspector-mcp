import { cn } from "../lib/utils";
import type { Prompt } from "../constants/types";
import { Sparkles } from "lucide-react";

interface PromptsPanelProps {
    prompts: Prompt[];
    onSelect: (prompt: Prompt) => void;
    visible: boolean;
}

export const PromptsPanel = ({ prompts, onSelect, visible }: PromptsPanelProps) => {
    if (!visible || prompts.length === 0) return null;

    return (
        <div
            className={cn(
                "absolute bottom-full left-0 mb-3 ml-1 flex flex-wrap gap-2 max-w-[480px]",
                "transition-all duration-300 ease-out origin-bottom-left",
                visible
                    ? "opacity-100 translate-y-0 scale-100 pointer-events-auto"
                    : "opacity-0 translate-y-2 scale-95 pointer-events-none"
            )}
        >
            {prompts.map((prompt) => (
                <button
                    key={prompt.name}
                    onClick={(e) => {
                        e.stopPropagation();
                        onSelect(prompt);
                    }}
                    className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-full",
                        "bg-muted/90 backdrop-blur-md border border-border shadow-sm",
                        "text-xs font-medium text-foreground",
                        "hover:bg-accent hover:border-accent-foreground/20 hover:scale-105 active:scale-95",
                        "transition-all duration-200"
                    )}
                    title={prompt.description || prompt.title || prompt.name}
                >
                    {prompt.icons?.[0]?.src ? (
                        <img
                            src={prompt.icons[0].src}
                            alt=""
                            className="w-3.5 h-3.5 object-contain"
                        />
                    ) : (
                        <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                    )}
                    <span>{prompt.title || prompt.name}</span>
                </button>
            ))}
        </div>
    );
};
