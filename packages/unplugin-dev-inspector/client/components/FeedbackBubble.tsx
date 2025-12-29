import React, { useState, useEffect } from "react";
import type { Client } from "@modelcontextprotocol/sdk/client";
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
import { Loader2, CheckCircle2, XCircle, Copy } from "lucide-react";
import { PlanProgress } from "./PlanProgress";
import { usePlanProgress } from "../hooks/usePlanProgress";
import { ContextPicker, type SelectedContext } from "./ContextPicker";
import { formatCopyContext } from "../utils/format";
import type { ConsoleMessage, NetworkRequest } from "../types";

interface FeedbackBubbleProps {
  sourceInfo: InspectedElement;
  onClose: () => void;
  mode: "input" | "loading" | "success" | "error";
  onSubmit?: (feedback: string, continueInspecting?: boolean, context?: SelectedContext) => void;
  resultMessage?: string;
  /** MCP client for context data */
  client?: Client | null;
  /** Whether MCP client is ready */
  isClientReady?: boolean;
}

export const FeedbackBubble: React.FC<FeedbackBubbleProps> = ({
  sourceInfo,
  onClose,
  mode,
  onSubmit,
  resultMessage,
  client = null,
  isClientReady = false,
}) => {
  const plan = usePlanProgress();
  const [feedback, setFeedback] = useState("");
  const [open, setOpen] = useState(true);
  const [selectedContext, setSelectedContext] = useState<SelectedContext>({
    includeElement: true,  // Default checked
    includeStyles: true,   // Default checked
    consoleIds: [],
    networkIds: [],
  });
  const [contextData, setContextData] = useState<{
    consoleMessages: ConsoleMessage[];
    networkRequests: NetworkRequest[];
    networkDetails: Record<number, string>;
  }>({
    consoleMessages: [],
    networkRequests: [],
    networkDetails: {},
  });

  const handleDataReady = (data: {
    consoleMessages: ConsoleMessage[];
    networkRequests: NetworkRequest[];
    networkDetails: Record<number, string>;
  }) => {
    setContextData(data);
  };

  useEffect(() => {
    if (!open) onClose();
  }, [open, onClose]);

  const handleSubmit = (continueInspecting: boolean) => {
    if (onSubmit) {
      const hasContext = selectedContext.includeElement || selectedContext.includeStyles ||
        selectedContext.consoleIds.length > 0 || selectedContext.networkIds.length > 0;
      onSubmit(feedback, continueInspecting, hasContext ? selectedContext : undefined);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && onSubmit) {
      e.preventDefault();
      const hasContext = selectedContext.includeElement || selectedContext.includeStyles ||
        selectedContext.consoleIds.length > 0 || selectedContext.networkIds.length > 0;
      onSubmit(feedback, e.shiftKey, hasContext ? selectedContext : undefined);
    }
  };

  const handleCopyAndGo = async () => {
    // Get actual console and network data for selected IDs
    const selectedConsole = contextData.consoleMessages.filter(msg =>
      selectedContext.consoleIds.includes(msg.msgid)
    );

    // Get network requests with their cached details
    const selectedNetwork = contextData.networkRequests
      .filter(req => selectedContext.networkIds.includes(req.reqid))
      .map(req => ({
        ...req,
        details: contextData.networkDetails[req.reqid] || null,
      }));

    // Build Markdown content
    const markdown = formatCopyContext({
      sourceInfo: selectedContext.includeElement || selectedContext.includeStyles ? sourceInfo : undefined,
      includeElement: selectedContext.includeElement,
      includeStyles: selectedContext.includeStyles,
      feedback: feedback || undefined,
      consoleMessages: selectedConsole.length > 0 ? selectedConsole : undefined,
      networkRequests: selectedNetwork.length > 0 ? selectedNetwork : undefined,
    });

    try {
      await navigator.clipboard.writeText(markdown);
      setOpen(false);
    } catch {
      console.error('Failed to copy to clipboard');
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
          : "Tell the AI";

  const icon = (mode === "success" || (mode === "loading" && allStepsCompleted))
    ? <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-500" />
    : mode === "error"
      ? <XCircle className="h-5 w-5 text-red-600 dark:text-red-500" />
      : mode === "loading"
        ? <Loader2 className="h-5 w-5 animate-spin text-blue-600 dark:text-blue-500" />
        : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent onClose={() => setOpen(false)} className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {icon}
            {title}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {mode === "input" ? (
              "Describe what you want to fix or improve, then add context below"
            ) : (
              <span className="font-mono">{sourceInfo.component} • {sourceInfo.file}:{sourceInfo.line}:{sourceInfo.column}</span>
            )}
          </DialogDescription>
        </DialogHeader>

        {mode === "input" && (
          <div className="py-5 space-y-5">
            <textarea
              autoFocus
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="What should the AI do with this element?"
              className="w-full min-h-[120px] px-4 py-3 rounded-lg border border-input bg-background text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
            />

            {/* Separator */}
            <div className="border-t border-border" />

            {/* Context Picker */}
            <ContextPicker
              client={client}
              isClientReady={isClientReady}
              sourceInfo={sourceInfo}
              selectedContext={selectedContext}
              onSelectionChange={setSelectedContext}
              onDataReady={handleDataReady}
              isAutomated={!!sourceInfo.automated}
              userInput={feedback}
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

        <DialogFooter className="flex items-center gap-3 pt-2">
          {mode === "input" ? (
            <>
              <Button variant="ghost" size="sm" onClick={handleCopyAndGo} className="mr-auto">
                <Copy className="w-4 h-4 mr-1.5" />
                Copy & Go
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => handleSubmit(true)}>
                  Submit & Continue
                </Button>
                <Button onClick={() => handleSubmit(false)}>
                  Submit
                </Button>
              </div>
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
