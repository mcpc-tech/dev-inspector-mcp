import { useRef, useState, useEffect, useCallback } from "react";

interface UseDraggableOptions {
  initialOffset?: { x: number; y: number };
}

export function useDraggable({ initialOffset = { x: 0, y: 0 } }: UseDraggableOptions = {}) {
  const elementRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Store the current offset from the initial position (which is centered via CSS)
  const offsetRef = useRef(initialOffset);

  // Store drag start coordinates
  const dragStartRef = useRef({ x: 0, y: 0 });
  const initialDragOffsetRef = useRef({ x: 0, y: 0 });

  const updateTransform = useCallback(() => {
    if (elementRef.current) {
      const { x, y } = offsetRef.current;
      // Maintain the -50% X translation for centering, add the drag offset
      elementRef.current.style.transform = `translate3d(calc(-50% + ${x}px), ${y}px, 0)`;
    }
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Ignore clicks on interactive elements
    if ((e.target as HTMLElement).closest("button, input, a, [data-no-drag]")) {
      return;
    }

    e.preventDefault(); // Prevent text selection
    setIsDragging(true);

    dragStartRef.current = { x: e.clientX, y: e.clientY };
    initialDragOffsetRef.current = {
      ...offsetRef.current,
    };
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;

      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;

      offsetRef.current = {
        x: initialDragOffsetRef.current.x + dx,
        y: initialDragOffsetRef.current.y + dy,
      };

      updateTransform();
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove, { passive: true });
      window.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, updateTransform]);

  // Initial application of transform
  useEffect(() => {
    updateTransform();
  }, [updateTransform]);

  return {
    elementRef,
    isDragging,
    handleMouseDown,
  };
}
