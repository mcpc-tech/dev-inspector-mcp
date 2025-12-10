import React, { useState } from "react";
import { Task, TaskTrigger, TaskContent, TaskItem } from "./ai-elements/task";
import { CheckCircle2, Circle, AlertCircle, Loader } from "lucide-react";

interface PlanStep {
  id: number;
  title: string;
  status: "pending" | "in-progress" | "completed" | "failed";
  description?: string;
}

interface Plan {
  steps: PlanStep[];
}

interface PlanProgressProps {
  plan: Plan | null;
}

const getStatusIcon = (status: string) => {
  if (status === "completed") return <CheckCircle2 className="size-4 text-green-500" />;
  if (status === "in-progress") return <Loader className="size-4 text-blue-500 animate-spin" />;
  if (status === "failed") return <AlertCircle className="size-4 text-red-500" />;
  return <Circle className="size-4 text-gray-400" />;
};

const getStatusText = (status: string) => {
  if (status === "completed") return "Completed";
  if (status === "in-progress") return "In Progress";
  if (status === "failed") return "Failed";
  return "Pending";
};

export function PlanProgress({ plan }: PlanProgressProps) {
  const [isOpen, setIsOpen] = useState(true);

  if (!plan || !plan.steps || plan.steps.length === 0) {
    return null;
  }

  const completed = plan.steps.filter((s) => s.status === "completed").length;
  const total = plan.steps.length;
  const progress = Math.round((completed / total) * 100);

  return (
    <div className="w-full space-y-2">
      <Task defaultOpen={isOpen}>
        <TaskTrigger
          title={`Plan Progress: ${completed}/${total} (${progress}%)`}
          onClick={() => setIsOpen(!isOpen)}
        />
        <TaskContent>
          <div className="space-y-3">
            {plan.steps.map((step) => (
              <TaskItem key={step.id}>
                <div className="flex items-start gap-3">
                  {getStatusIcon(step.status)}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{step.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {getStatusText(step.status)}
                      </span>
                    </div>
                    {step.description && (
                      <p className="mt-1 text-xs text-muted-foreground">{step.description}</p>
                    )}
                  </div>
                </div>
              </TaskItem>
            ))}
          </div>
        </TaskContent>
      </Task>
    </div>
  );
}
