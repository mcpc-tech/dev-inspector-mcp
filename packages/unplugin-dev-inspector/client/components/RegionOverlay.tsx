import React, { useState, useEffect, useRef } from "react";
import { getSourceInfo } from "../sourceDetector";
import type { InspectedElement } from "../types";
import { MessageSquare, X, Check, Edit2 } from "lucide-react";
import { cn } from "../lib/utils";

// Performance limit: cap related elements to avoid UI lag
const MAX_RELATED_ELEMENTS = 50;

interface RegionOverlayProps {
    isActive: boolean;
    onSelectionComplete: (result: InspectedElement) => void;
    onCancel: () => void;
}

interface IdentifiedElement {
    el: Element;
    rect: DOMRect;
    info: InspectedElement;
    isPrimary: boolean;
    note?: string;
}

const calculateIoU = (r1: DOMRect, r2: { left: number; top: number; width: number; height: number }, area2: number) => {
    const left = Math.max(r1.left, r2.left);
    const top = Math.max(r1.top, r2.top);
    const right = Math.min(r1.right, r2.left + r2.width);
    const bottom = Math.min(r1.bottom, r2.top + r2.height);

    const width = Math.max(0, right - left);
    const height = Math.max(0, bottom - top);
    const intersection = width * height;

    const area1 = r1.width * r1.height;
    const union = area1 + area2 - intersection;
    return union > 0 ? intersection / union : 0;
};

export const RegionOverlay: React.FC<RegionOverlayProps> = ({
    isActive,
    onSelectionComplete,
    onCancel,
}) => {
    // Selection State
    const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
    const [currentPoint, setCurrentPoint] = useState<{ x: number; y: number } | null>(null);
    const [isSelecting, setIsSelecting] = useState(false);

    // Annotation State
    const [isAnnotating, setIsAnnotating] = useState(false);
    const [selectionRect, setSelectionRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
    const [identifiedElements, setIdentifiedElements] = useState<IdentifiedElement[]>([]);
    const [activeNoteIdx, setActiveNoteIdx] = useState<number | null>(null);
    const [tempNote, setTempNote] = useState("");

    const overlayRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Auto-focus input when opening note
    useEffect(() => {
        if (activeNoteIdx !== null && inputRef.current) {
            inputRef.current.focus();
        }
    }, [activeNoteIdx]);

    const resetState = () => {
        setIsAnnotating(false);
        setSelectionRect(null);
        setIdentifiedElements([]);
        setStartPoint(null);
        setCurrentPoint(null);
        setIsSelecting(false);
        setActiveNoteIdx(null);
        setTempNote("");
    };

    useEffect(() => {
        if (!isActive) {
            resetState();
            return;
        }

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                if (activeNoteIdx !== null) {
                    setActiveNoteIdx(null);
                } else if (isAnnotating) {
                    resetState();
                } else {
                    onCancel();
                }
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isActive, onCancel, isAnnotating, activeNoteIdx]);

    const getSelectionRect = () => {
        if (!startPoint || !currentPoint) return null;
        return {
            left: Math.min(startPoint.x, currentPoint.x),
            top: Math.min(startPoint.y, currentPoint.y),
            width: Math.abs(currentPoint.x - startPoint.x),
            height: Math.abs(currentPoint.y - startPoint.y),
        };
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (isAnnotating) return; // Pass clicks to annotation UI
        if (e.button !== 0) return; // Only left click
        e.stopPropagation();
        e.preventDefault();
        setIsSelecting(true);
        setStartPoint({ x: e.clientX, y: e.clientY });
        setCurrentPoint({ x: e.clientX, y: e.clientY });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isAnnotating) return;
        if (!isSelecting) return;
        e.stopPropagation();
        e.preventDefault();
        setCurrentPoint({ x: e.clientX, y: e.clientY });
    };

    const handleMouseUp = (e: React.MouseEvent) => {
        if (isAnnotating) return;
        if (!isSelecting || !startPoint || !currentPoint) return;
        e.stopPropagation();
        e.preventDefault();
        setIsSelecting(false);

        const rect = getSelectionRect();
        if (rect && rect.width > 5 && rect.height > 5) {
            setSelectionRect(rect);
            identifyElements(rect);
            setIsAnnotating(true);
        } else {
            // Too small, treat as cancel or ignore
            setStartPoint(null);
            setCurrentPoint(null);
        }
    };

    const identifyElements = (rect: { left: number; top: number; width: number; height: number }) => {
        const allElements = document.body.querySelectorAll('*');
        const candidates: { el: Element; rect: DOMRect; iou: number }[] = [];

        const selArea = rect.width * rect.height;

        // processing loop
        for (let i = 0; i < allElements.length; i++) {
            const el = allElements[i];
            if (el === overlayRef.current || overlayRef.current?.contains(el)) continue;
            const tagName = el.tagName.toLowerCase();
            if (tagName === 'dev-inspector-mcp' || tagName === 'html' || tagName === 'body') continue;

            const r = el.getBoundingClientRect();

            // Fast Intersection Check
            if (r.right < rect.left || r.left > rect.left + rect.width ||
                r.bottom < rect.top || r.top > rect.top + rect.height) {
                continue;
            }

            // Center Point Check (Refined Selection)
            const centerX = r.left + r.width / 2;
            const centerY = r.top + r.height / 2;
            const centerInside =
                centerX >= rect.left &&
                centerX <= rect.left + rect.width &&
                centerY >= rect.top &&
                centerY <= rect.top + rect.height;

            if (!centerInside) continue;

            // Visibility Check (Optimized)
            // @ts-ignore - checkVisibility is relatively new
            if (el.checkVisibility) {
                // @ts-ignore
                if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
            } else {
                if (r.width === 0 || r.height === 0) continue;
                const style = window.getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
            }

            // Calculate IoU immediately
            const iou = calculateIoU(r, rect, selArea);
            candidates.push({ el, rect: r, iou });
        }

        if (candidates.length === 0) {
            setIsAnnotating(false);
            setStartPoint(null);
            setCurrentPoint(null);
            return;
        }

        // Sort by IoU (descending) for Primary detection
        candidates.sort((a, b) => b.iou - a.iou);

        // Find Primary
        let outermostElement = candidates[0].el;
        for (const entry of candidates) {
            const info = getSourceInfo(entry.el);
            if (info.file && info.file !== 'unknown') {
                outermostElement = entry.el;
                break;
            }
        }

        // Build result set only for useful elements (with source info)
        const results: IdentifiedElement[] = [];

        // Add Primary First
        const primaryInfo = getSourceInfo(outermostElement);
        results.push({
            el: outermostElement,
            rect: outermostElement.getBoundingClientRect(),
            info: primaryInfo,
            isPrimary: true
        });

        // Add others
        let count = 0;
        for (const entry of candidates) {
            if (entry.el === outermostElement) continue;
            if (count >= MAX_RELATED_ELEMENTS) break;

            const info = getSourceInfo(entry.el);
            if (info.file && info.file !== 'unknown') {
                results.push({
                    el: entry.el,
                    rect: entry.rect, // Use captured rect
                    info: info,
                    isPrimary: false
                });
                count++;
            }
        }

        // Sort results by area descending (Largest First -> Rendered First -> Behind)
        results.sort((a, b) => {
            const areaA = a.rect.width * a.rect.height;
            const areaB = b.rect.width * b.rect.height;
            return areaB - areaA;
        });

        setIdentifiedElements(results);
    };

    const handleSaveNote = (contentOverride?: string) => {
        if (activeNoteIdx === null) return;

        // If contentOverride is provided (even empty string), use it. 
        // Otherwise use tempNote.
        // We must check typeof because onClick might pass an Event object if called directly.
        const textToSave = (typeof contentOverride === 'string') ? contentOverride : tempNote;

        const newElements = [...identifiedElements];
        newElements[activeNoteIdx].note = textToSave.trim() || undefined;
        setIdentifiedElements(newElements);
        setActiveNoteIdx(null);
    };

    const handleComplete = () => {
        if (identifiedElements.length === 0) return;

        // Construct final data
        const primary = identifiedElements.find(e => e.isPrimary) || identifiedElements[0];
        const primaryInfo = { ...primary.info };
        if (primary.note) primaryInfo.note = primary.note;

        const related: InspectedElement[] = identifiedElements
            .filter(e => e !== primary)
            .map(e => {
                // Strip heavy styles
                const { computedStyles: _, styles: __, ...lightElementInfo } = e.info.elementInfo || {};
                return {
                    ...e.info,
                    elementInfo: lightElementInfo as InspectedElement['elementInfo'],
                    note: e.note
                };
            });

        primaryInfo.relatedElements = related;
        onSelectionComplete(primaryInfo);
    };

    if (!isActive) return null;

    const displayRect = isAnnotating ? selectionRect : getSelectionRect();

    return (
        <div
            ref={overlayRef}
            className={cn(
                "fixed inset-0 z-[2147483646]",
                isAnnotating ? "cursor-default pointer-events-auto" : "cursor-crosshair pointer-events-auto"
            )}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
        >
            {/* Selection Rect */}
            {displayRect && (
                <div
                    className="absolute border-2 border-blue-500 bg-blue-500/5 z-50 pointer-events-none"
                    style={{
                        left: displayRect.left,
                        top: displayRect.top,
                        width: displayRect.width,
                        height: displayRect.height,
                    }}
                >
                    {/* Dimensions label / Actions */}
                    <div className="absolute -top-10 left-0 flex gap-2 pointer-events-auto">
                        <div className="bg-blue-600 text-white text-xs px-2 py-1.5 rounded shadow-sm font-medium">
                            {Math.round(displayRect.width)} x {Math.round(displayRect.height)}
                        </div>
                        {isAnnotating && (
                            <button
                                onClick={handleComplete}
                                className="bg-zinc-900 hover:bg-zinc-800 text-white text-xs px-3 py-1.5 rounded shadow-sm font-medium flex items-center gap-1.5 transition-colors"
                            >
                                <Check className="w-3.5 h-3.5" />
                                Finish & Inspect
                            </button>
                        )}

                        {isAnnotating && (
                            <button
                                onClick={resetState}
                                className="bg-white text-zinc-700 hover:bg-zinc-50 border border-zinc-200 text-xs px-3 py-1.5 rounded shadow-sm font-medium transition-colors flex items-center gap-1.5"
                            >
                                <X className="w-3.5 h-3.5" />
                                Close
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Annotation Markers */}
            {isAnnotating && identifiedElements.map((item, idx) => (
                <div
                    key={idx}
                    className={cn(
                        "absolute border transition-all duration-200 cursor-pointer group",
                        item.note
                            ? "border-yellow-400 bg-yellow-400/10 z-20"
                            : item.isPrimary
                                ? "border-blue-400/50 hover:border-blue-500 bg-blue-500/5 hover:bg-blue-500/10"
                                : "border-slate-300/30 hover:border-blue-400 hover:bg-blue-400/10"
                    )}
                    style={{
                        left: item.rect.left,
                        top: item.rect.top,
                        width: item.rect.width,
                        height: item.rect.height,
                    }}
                    onClick={(e) => {
                        e.stopPropagation();
                        setActiveNoteIdx(idx);
                        setTempNote(item.note || "");
                    }}
                >
                    {/* Note Indicator Badge */}
                    {item.note && (
                        <div className="absolute -top-2.5 -right-2.5 w-5 h-5 bg-yellow-400 text-yellow-900 rounded-full flex items-center justify-center shadow-sm z-30">
                            <MessageSquare className="w-3 h-3" />
                        </div>
                    )}

                    {/* Edit Icon on Hover (if no note) */}
                    {!item.note && (
                        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 p-1 rounded shadow-sm">
                            <Edit2 className="w-3 h-3 text-slate-600" />
                        </div>
                    )}
                </div>
            ))}

            {/* Note Editor Popover */}
            {activeNoteIdx !== null && identifiedElements[activeNoteIdx] && (
                <div
                    className="absolute z-50 bg-white rounded-lg shadow-xl border border-slate-200 p-3 w-64 animate-in fade-in zoom-in-95 duration-100"
                    style={{
                        left: Math.min(window.innerWidth - 280, Math.max(10, identifiedElements[activeNoteIdx].rect.right + 10)),
                        // Ensure it doesn't go off bottom (assuming ~250px height) or top
                        top: Math.min(window.innerHeight - 250, Math.max(10, identifiedElements[activeNoteIdx].rect.top))
                    }}
                    onClick={e => e.stopPropagation()}
                >
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                            <MessageSquare className="w-3.5 h-3.5" />
                            Add Annotation
                        </span>
                        <button
                            onClick={() => setActiveNoteIdx(null)}
                            className="text-slate-400 hover:text-slate-600"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>

                    <div className="text-[10px] text-slate-400 font-mono mb-2 truncate">
                        <span className="font-semibold text-slate-600">{identifiedElements[activeNoteIdx].info.component || 'Element'}</span>
                        <span className="mx-1.5 opacity-50">•</span>
                        {identifiedElements[activeNoteIdx].info.file ? `${identifiedElements[activeNoteIdx].info.file.split('/').pop()}:${identifiedElements[activeNoteIdx].info.line}` : 'Unknown Location'}
                    </div>

                    <input
                        ref={inputRef}
                        type="text"
                        value={tempNote}
                        onChange={e => setTempNote(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === "Enter") handleSaveNote();
                            if (e.key === "Escape") setActiveNoteIdx(null);
                        }}
                        placeholder="E.g. Wrong color, missing padding..."
                        className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
                    />

                    <div className="flex justify-end gap-2">
                        <button
                            onClick={() => {
                                setTempNote("");
                                handleSaveNote("");
                            }}
                            className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1"
                        >
                            Clear
                        </button>
                        <button
                            onClick={() => handleSaveNote()}
                            className="text-xs bg-zinc-900 hover:bg-zinc-800 text-white px-2 py-1 rounded"
                        >
                            Save
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
