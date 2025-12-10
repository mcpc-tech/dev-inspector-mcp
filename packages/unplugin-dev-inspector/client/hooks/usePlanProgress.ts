import { useState, useEffect } from "react";

interface PlanStep {
  id: number;
  title: string;
  status: "pending" | "in-progress" | "completed" | "failed";
  description?: string;
}

interface Plan {
  steps: PlanStep[];
}

export function usePlanProgress() {
  const [plan, setPlan] = useState<Plan | null>(null);

  useEffect(() => {
    function handlePlanProgress(event: Event) {
      const customEvent = event as CustomEvent;
      setPlan(customEvent.detail.plan);
    }

    window.addEventListener("plan-progress-reported", handlePlanProgress as EventListener);
    return () =>
      window.removeEventListener("plan-progress-reported", handlePlanProgress as EventListener);
  }, []);

  return plan;
}
