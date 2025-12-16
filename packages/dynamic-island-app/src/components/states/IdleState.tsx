import React from 'react';
import { Sparkles } from 'lucide-react';

export function IdleState() {
    return (
        <div className="flex items-center justify-center gap-2 h-full px-4 cursor-pointer">
            <Sparkles className="w-4 h-4 text-white/50" />
            <span className="text-xs text-white/50">Click to ask...</span>
        </div>
    );
}
