import React from 'react';
import { Terminal, Loader2 } from 'lucide-react';

interface ExecutingStateProps {
    toolName: string;
    args?: Record<string, unknown>;
}

export function ExecutingState({ toolName, args }: ExecutingStateProps) {
    // Format args preview
    const argsPreview = args ? JSON.stringify(args).slice(0, 40) : '';

    return (
        <div className="flex items-center gap-3 h-full px-4">
            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/20">
                <Loader2 className="w-3.5 h-3.5 text-emerald-400 animate-spin-slow" />
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <Terminal className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                    <span className="text-sm font-medium text-white/90 truncate">
                        {toolName}
                    </span>
                </div>
                {argsPreview && (
                    <span className="text-xs text-white/40 font-mono truncate block">
                        {argsPreview}{argsPreview.length >= 40 && '...'}
                    </span>
                )}
            </div>
        </div>
    );
}
