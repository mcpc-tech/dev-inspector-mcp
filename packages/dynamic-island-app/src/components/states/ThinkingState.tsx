import React from 'react';
import { Sparkles } from 'lucide-react';

interface ThinkingStateProps {
    message?: string;
}

export function ThinkingState({ message }: ThinkingStateProps) {
    return (
        <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center animate-pulse">
                <Sparkles className="w-3 h-3 text-purple-400" />
            </div>
            <span className="text-sm text-white/80 truncate">
                {message || 'Thinking...'}
            </span>
        </div>
    );
}
