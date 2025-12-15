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
import { Button } from "./ui/button";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { PlanProgress } from "./PlanProgress";
import { usePlanProgress } from "../hooks/usePlanProgress";

interface FeedbackBubbleProps {
  sourceInfo: InspectedElement;
  onClose: () => void;
  mode: "input" | "loading" | "success" | "error";
  onSubmit?: (feedback: string, continueInspecting?: boolean) => void;
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

  useEffect(() => {
    if (!open) onClose();
  }, [open, onClose]);

  const handleSubmit = (continueInspecting: boolean) => {
    if (feedback.trim() && onSubmit) {
      onSubmit(feedback, continueInspecting);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && feedback.trim() && onSubmit) {
      e.preventDefault();
      onSubmit(feedback, e.shiftKey);
    }
  };

  const allStepsCompleted = plan?.steps.every((s) => s.status === "completed");

  const title = mode === "success" 
    ? "Success" 
    : mode === "error" 
    ? "Error" 
    : mode === "loading" && allStepsCompleted 
    ? "Success" 
    : mode === "loading" 
    ? "Processing..." 
    : "Describe the issue";

  const icon = (mode === "success" || (mode === "loading" && allStepsCompleted))
    ? <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-500" />
    : mode === "error"
    ? <XCircle className="h-5 w-5 text-red-600 dark:text-red-500" />
    : mode === "loading"
    ? <Loader2 className="h-5 w-5 animate-spin text-blue-600 dark:text-blue-500" />
    : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent onClose={() => setOpen(false)}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {icon}
            {title}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {sourceInfo.component} • {sourceInfo.file}:{sourceInfo.line}:{sourceInfo.column}
          </DialogDescription>
        </DialogHeader>

        {mode === "input" && (
          <div className="py-4">
            <textarea
              autoFocus
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe the issue - will be queued for AI analysis (Shift+Enter to continue)"
              className="w-full min-h-[120px] px-3 py-2 rounded-md border border-input bg-background text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        )}

        {mode === "loading" && plan && (
          <div className="space-y-4">
            <PlanProgress plan={plan} />
          </div>
        )}

        {(mode === "success" || mode === "error") && (
          <div className="space-y-4">
            <p className="text-sm text-foreground">{resultMessage}</p>
            {plan && <PlanProgress plan={plan} />}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {mode === "input" ? (
            <>
              <Button variant="outline" onClick={() => handleSubmit(true)} disabled={!feedback.trim()}>
                Submit & Continue
              </Button>
              <Button onClick={() => handleSubmit(false)} disabled={!feedback.trim()}>
                Submit
              </Button>
            </>
          ) : (
            <Button onClick={() => setOpen(false)} className="w-full">
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
