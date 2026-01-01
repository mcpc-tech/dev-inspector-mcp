import React, { useState, useEffect, useRef } from "react";
import { getSourceInfo } from "../sourceDetector";
import type { InspectedElement } from "../types";

// Performance limit: cap related elements to avoid UI lag
const MAX_RELATED_ELEMENTS = 50;

interface RegionOverlayProps {
    isActive: boolean;
    onSelectionComplete: (result: InspectedElement) => void;
    onCancel: () => void;
}

export const RegionOverlay: React.FC<RegionOverlayProps> = ({
    isActive,
    onSelectionComplete,
    onCancel,
}) => {
    const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
    const [currentPoint, setCurrentPoint] = useState<{ x: number; y: number } | null>(null);
    const [isSelecting, setIsSelecting] = useState(false);
    const overlayRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isActive) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                onCancel();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isActive, onCancel]);

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
        if (e.button !== 0) return; // Only left click
        e.stopPropagation();
        e.preventDefault();
        setIsSelecting(true);
        setStartPoint({ x: e.clientX, y: e.clientY });
        setCurrentPoint({ x: e.clientX, y: e.clientY });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isSelecting) return;
        e.stopPropagation();
        e.preventDefault();
        setCurrentPoint({ x: e.clientX, y: e.clientY });
    };

    const handleMouseUp = (e: React.MouseEvent) => {
        if (!isSelecting || !startPoint || !currentPoint) return;
        e.stopPropagation();
        e.preventDefault();
        setIsSelecting(false);

        const rect = getSelectionRect();
        if (rect && rect.width > 5 && rect.height > 5) {
            processSelection(rect);
        } else {
            // Too small, treat as cancel or ignore
            setStartPoint(null);
            setCurrentPoint(null);
        }
    };

    const processSelection = (rect: { left: number; top: number; width: number; height: number }) => {
        const allElements = document.body.querySelectorAll('*');
        const includedElements: Element[] = [];

        // 1. Find all intersecting elements
        allElements.forEach((el) => {
            if (el === overlayRef.current || overlayRef.current?.contains(el)) return; // Ignore overlay itself
            // Ignore dev-inspector shadow host
            if (el.tagName.toLowerCase() === 'dev-inspector-mcp') return;
            // Ignore root elements - we usually want content
            if (el.tagName.toLowerCase() === 'html' || el.tagName.toLowerCase() === 'body') return;

            const r = el.getBoundingClientRect();

            // Check intersection
            const intersects = !(
                r.right < rect.left ||
                r.left > rect.left + rect.width ||
                r.bottom < rect.top ||
                r.top > rect.top + rect.height
            );

            if (intersects) {
                // Check visibility
                const style = window.getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return;

                includedElements.push(el);
            }
        });

        if (includedElements.length === 0) {
            setStartPoint(null);
            setCurrentPoint(null);
            return;
        }

        // 2. Identify "Best Matching" element (Primary)
        // Heuristic: Intersection over Union (IoU) - standard logic for object detection.
        // We want the element that best "matches" the selection box.

        const getArea = (r: DOMRect) => r.width * r.height;
        const selArea = rect.width * rect.height;

        const getIntersectionArea = (r1: DOMRect, r2: { left: number, top: number, width: number, height: number }) => {
            const left = Math.max(r1.left, r2.left);
            const top = Math.max(r1.top, r2.top);
            const right = Math.min(r1.right, r2.left + r2.width);
            const bottom = Math.min(r1.bottom, r2.top + r2.height);
            const width = Math.max(0, right - left);
            const height = Math.max(0, bottom - top);
            return width * height;
        };

        const scoredElements = includedElements.map(el => {
            const r = el.getBoundingClientRect();
            const elArea = getArea(r);
            const intersection = getIntersectionArea(r, rect);
            const union = elArea + selArea - intersection;
            const iou = union > 0 ? intersection / union : 0;
            return { el, iou };
        });

        // Sort by IoU (descending)
        scoredElements.sort((a, b) => b.iou - a.iou);

        // Find the first element that has valid source info
        let outermostElement = scoredElements[0]?.el || includedElements[0];

        for (const entry of scoredElements) {
            const info = getSourceInfo(entry.el);

            if (info.file && info.file !== 'unknown') {
                outermostElement = entry.el;
                break;
            }
        }

        // 3. Generate Source Info
        const primaryInfo = getSourceInfo(outermostElement);

        // Light source info for others (strip heavy styles)
        const related: InspectedElement[] = scoredElements
            .filter(e => e.el !== outermostElement) // Exclude primary
            .slice(0, MAX_RELATED_ELEMENTS)
            .map(entry => {
                const info = getSourceInfo(entry.el);
                if (info.elementInfo) {
                    // Strip heavy computed styles for related elements to save performance
                    const { computedStyles: _, styles: __, ...lightElementInfo } = info.elementInfo;
                    return { ...info, elementInfo: lightElementInfo as InspectedElement['elementInfo'] };
                }
                return info;
            });

        primaryInfo.relatedElements = related;

        onSelectionComplete(primaryInfo);

        // Reset
        setStartPoint(null);
        setCurrentPoint(null);
    };

    if (!isActive) return null;

    const rect = getSelectionRect();

    return (
        <div
            ref={overlayRef}
            className="fixed inset-0 z-[2147483646] cursor-crosshair" // High z-index but below inspector host potentially?
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            style={{ pointerEvents: 'auto' }}
        >
            {/* Selection Rect */}
            {rect && (
                <div
                    className="absolute border-2 border-purple-500 bg-purple-500/10 backdrop-blur-[1px]"
                    style={{
                        left: rect.left,
                        top: rect.top,
                        width: rect.width,
                        height: rect.height,
                    }}
                >
                    {/* Dimensions label */}
                    <div className="absolute -top-6 left-0 bg-purple-600 text-white text-[10px] px-1.5 py-0.5 rounded shadow-sm">
                        {Math.round(rect.width)} x {Math.round(rect.height)}
                    </div>
                </div>
            )}
        </div>
    );
};
