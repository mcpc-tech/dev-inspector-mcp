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
                "origin-bottom-left"
            )}
        >
            {prompts.map((prompt, index) => (
                <button
                    key={prompt.name}
                    onClick={(e) => {
                        e.stopPropagation();
                        onSelect(prompt);
                    }}
                    style={{
                        animationDelay: `${index * 50}ms`,
                        opacity: 0,
                        animation: `prompt-fade-in 0.3s ease-out ${index * 50}ms forwards`
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
                    <span>{prompt.title || prompt.name}</span>
                </button>
            ))}
        </div>
    );
};
