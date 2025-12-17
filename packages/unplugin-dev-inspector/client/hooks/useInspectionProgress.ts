import { useState, useEffect } from "react";
import type { InspectionItem } from "../components/InspectionQueue";

const STORAGE_KEY = "inspector-inspection-items";

export function useInspectionProgress() {
  const [inspections, setInspections] = useState<InspectionItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    // Handle progress updates
    function handlePlanProgress(event: Event) {
      const customEvent = event as CustomEvent;
      const { plan, inspectionId } = customEvent.detail;

      setInspections((prev) =>
        prev.map((item) =>
          item.id === inspectionId
            ? {
                ...item,
                status: "in-progress" as const,
                progress: plan,
              }
            : item,
        ),
      );
    }

    // Handle result updates (completed/failed)
    function handleInspectionResult(event: Event) {
      const customEvent = event as CustomEvent;
      const { status, result, inspectionId } = customEvent.detail;

      setInspections((prev) =>
        prev.map((item) =>
          item.id === inspectionId
            ? {
                ...item,
                status: status as "completed" | "failed",
                result: result?.message || result,
                progress: undefined, // Clear progress when completed/failed
              }
            : item,
        ),
      );
    }

    function handleInspectionDeleted(event: Event) {
      const customEvent = event as CustomEvent;
      const { inspectionId } = customEvent.detail;

      setInspections((prev) => prev.filter((item) => item.id !== inspectionId));
    }

    window.addEventListener("plan-progress-reported", handlePlanProgress as EventListener);
    window.addEventListener("inspection-result-received", handleInspectionResult as EventListener);
    window.addEventListener("inspection-deleted", handleInspectionDeleted as EventListener);

    return () => {
      window.removeEventListener("plan-progress-reported", handlePlanProgress as EventListener);
      window.removeEventListener(
        "inspection-result-received",
        handleInspectionResult as EventListener,
      );
      window.removeEventListener("inspection-deleted", handleInspectionDeleted as EventListener);
    };
  }, []);

  // Sync to localStorage whenever inspections change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(inspections));
    } catch {
      console.warn("Failed to save inspections to localStorage");
    }
  }, [inspections]);

  return { inspections, setInspections };
}
