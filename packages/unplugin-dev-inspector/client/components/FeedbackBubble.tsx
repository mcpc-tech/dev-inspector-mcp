import React, { useState, useEffect } from "react";
import type { InspectedElement } from "../types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { PlanProgress } from "./PlanProgress";
import { usePlanProgress } from "../hooks/usePlanProgress";
import { useShadowRoot } from "../inspector";

interface FeedbackBubbleProps {
  sourceInfo: InspectedElement;
  onClose: () => void;
  mode: "input" | "loading" | "success" | "error";
  onSubmit?: (feedback: string) => void;
  resultMessage?: string;
}

export const FeedbackBubble: React.FC<FeedbackBubbleProps> = ({
  sourceInfo,
  onClose,
  mode,
  onSubmit,
  resultMessage,
}) => {
  const plan = usePlanProgress();
  const [feedback, setFeedback] = useState("");
  const [open, setOpen] = useState(true);
  const shadowRoot = useShadowRoot();
  const container =
    shadowRoot ||
    (typeof document !== "undefined" ? document.getElementById("source-inspector-root") : null);

  useEffect(() => {
    if (!open) {
      onClose();
    }
  }, [open, onClose]);

  const handleSubmit = () => {
    if (feedback.trim() && onSubmit) {
      onSubmit(feedback);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && mode === "input" && feedback.trim() && onSubmit) {
      onSubmit(feedback);
    }
  };

  const isAllPlanCompleted = plan?.steps.every((s) => s.status === "completed");

  const getTitle = () => {
    if (mode === "success") return "Processing Successful";
    if (mode === "error") return "Processing Failed";
    if (mode === "loading") return isAllPlanCompleted ? "Processing Successful" : "Processing...";
    return "Feedback to AI";
  };

  const getIcon = () => {
    if (mode === "success" || (mode === "loading" && isAllPlanCompleted)) {
      return <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-500" />;
    }
    if (mode === "error") return <XCircle className="h-5 w-5 text-red-600 dark:text-red-500" />;
    if (mode === "loading")
      return <Loader2 className="h-5 w-5 animate-spin text-blue-600 dark:text-blue-500" />;
    return null;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent container={container as HTMLElement} onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {getIcon()}
            {getTitle()}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {sourceInfo.component} • {sourceInfo.file}:{sourceInfo.line}:{sourceInfo.column}
          </DialogDescription>
        </DialogHeader>

        {mode === "input" && (
          <div className="grid gap-4 py-4">
            <Input
              autoFocus
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Enter your feedback..."
            />
          </div>
        )}

        {mode === "loading" && (
          <div className="space-y-4">{plan && <PlanProgress plan={plan} />}</div>
        )}

        {(mode === "success" || mode === "error") && (
          <div className="space-y-4">
            <div className="py-4 text-sm text-gray-700 dark:text-gray-300">{resultMessage}</div>
            {plan && <PlanProgress plan={plan} />}
          </div>
        )}

        <DialogFooter>
          {mode === "input" && (
            <>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={!feedback.trim()}>
                Submit
              </Button>
            </>
          )}
          {(mode === "success" || mode === "error") && (
            <Button onClick={() => setOpen(false)} className="w-full">
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
