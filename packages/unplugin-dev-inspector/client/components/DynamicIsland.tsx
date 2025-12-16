import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";

// Define the expanded state layout animation configuration
const springTransition = {
    type: "spring",
    stiffness: 300,
    damping: 30,
} as const;

interface DynamicIslandProps {
    collapsedContent?: React.ReactNode;
    expandedContent?: React.ReactNode;
    isExpanded: boolean;
    isWorking: boolean;
    status: "idle" | "working" | "error" | "success";
    dragHandlers: {
        ref: React.RefObject<HTMLDivElement | null>;
        onMouseDown: (e: React.MouseEvent) => void;
        isDragging: boolean;
    };
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
}

export const DynamicIsland = ({
    collapsedContent,
    expandedContent,
    isExpanded,
    isWorking,
    status,
    dragHandlers: { ref, onMouseDown, isDragging },
    onMouseEnter,
    onMouseLeave,
}: DynamicIslandProps) => {

    const isError = status === "error";

    return (
        <div
            className="fixed bottom-8 left-0 right-0 z-[999999] flex justify-center items-end pointer-events-none"
        // Pass drag handlers if we want the WHOLE thing draggable, but currently drag is on the internal motion div?
        // Actually, if we drag, we need to affect the position. 
        // If dragging is implemented via Framer Motion 'drag' prop on the child, it works relative to this parent.
        // But the original code applied `ref` for drag to the motion.div.
        >
            <motion.div
                ref={ref}
                initial={false}
                transition={springTransition}
                className={cn(
                    "relative pointer-events-auto",
                    isDragging ? "cursor-grabbing" : "cursor-grab"
                )}
                onMouseDown={onMouseDown}
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
            >
                <motion.div
                    layout
                    transition={springTransition}
                    className={cn(
                        "relative flex items-center shadow-2xl backdrop-blur-2xl border border-border/50",
                        // Improved contrast using popover
                        isError && !isExpanded ? "bg-destructive/10 border-destructive/20" : "bg-popover/85 supports-[backdrop-filter]:bg-popover/60",
                    )}
                    style={{
                        borderRadius: isExpanded ? 26 : 50, // Use 50px for pill shape (assuming height ~40px)
                        minWidth: isExpanded ? 500 : "auto",
                        width: isExpanded ? 500 : "auto",
                    }}
                >
                    <div className="flex flex-col w-full">

                        {/* Mode Logic: We either show collapsed or expanded content, never both at the same time in a conflicting way */}
                        <AnimatePresence mode="popLayout" initial={false}>
                            {!isExpanded ? (
                                <motion.div
                                    key="collapsed"
                                    initial={{ opacity: 0, scale: 0.9, filter: "blur(10px)" }}
                                    animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                                    exit={{ opacity: 0, scale: 0.9, filter: "blur(10px)", transition: { duration: 0.1 } }}
                                    transition={springTransition}
                                    className="flex items-center px-4 py-2.5" // Increased vertical padding for better proportions
                                >
                                    {collapsedContent}
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="expanded"
                                    initial={{ opacity: 0, scale: 0.95, filter: "blur(10px)" }}
                                    animate={{ opacity: 1, scale: 1, filter: "blur(0px)", transition: { delay: 0.05 } }}
                                    exit={{ opacity: 0, scale: 0.95, filter: "blur(10px)", transition: { duration: 0.1 } }}
                                    className="w-full p-3"
                                >
                                    {expandedContent}
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Liquid working indicator overlay (only for pill mode) */}
                        <AnimatePresence>
                            {isWorking && !isExpanded && (
                                <motion.div
                                    key="working-glow"
                                    initial={{ opacity: 0 }}
                                    animate={{
                                        opacity: [0.3, 0.6, 0.3],
                                        scale: [1, 1.05, 1],
                                    }}
                                    exit={{ opacity: 0 }}
                                    transition={{
                                        duration: 2,
                                        repeat: Infinity,
                                        ease: "easeInOut"
                                    }}
                                    className="absolute inset-0 bg-primary/10 z-[-1] rounded-full"
                                />
                            )}
                        </AnimatePresence>
                    </div>
                </motion.div>
            </motion.div>
        </div>
    );
};
