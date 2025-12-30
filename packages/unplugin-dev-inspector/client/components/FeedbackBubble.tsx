import React, { useState, useEffect, useMemo } from "react";
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
  screenshot?: string;
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
  screenshot = "",
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
    includeScreenshot: false, // Default unchecked (clipboard compatibility issues)
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

  // KISS: Extract repeated condition (was duplicated in handleKeyDown and handleSubmit)
  const hasContext = useMemo(() =>
    selectedContext.includeElement ||
    selectedContext.includeStyles ||
    selectedContext.consoleIds.length > 0 ||
    selectedContext.networkIds.length > 0,
    [selectedContext]
  );

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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && onSubmit) {
      e.preventDefault();
      const enrichedContext = hasContext ? prepareEnrichedContext() : undefined;
      onSubmit(feedback, e.shiftKey, enrichedContext);
    }
  };

  // Unified context preparation (KISS principle - reuse for both Copy & Go and Submit)
  const prepareEnrichedContext = () => {
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

    return {
      ...selectedContext,
      consoleMessages: selectedConsole,
      networkRequests: selectedNetwork,
      screenshot: selectedContext.includeScreenshot ? screenshot : undefined,
    };
  };

  const handleCopyAndGo = async () => {
    const enrichedContext = prepareEnrichedContext();

    const markdown = formatCopyContext({
      sourceInfo: enrichedContext.includeElement || enrichedContext.includeStyles ? sourceInfo : undefined,
      includeElement: enrichedContext.includeElement,
      includeStyles: enrichedContext.includeStyles,
      feedback: feedback || undefined,
      consoleMessages: enrichedContext.consoleMessages.length > 0 ? enrichedContext.consoleMessages : undefined,
      networkRequests: enrichedContext.networkRequests.length > 0 ? enrichedContext.networkRequests : undefined,
    });

    try {
      // Check if screenshot is included (Visual tab)
      const hasScreenshot = enrichedContext.screenshot && enrichedContext.includeScreenshot;

      if (hasScreenshot) {
        // Validate screenshot is a safe data URL to prevent XSS
        const isValidDataUrl = enrichedContext.screenshot?.startsWith('data:image/') ?? false;
        if (!isValidDataUrl) {
          console.warn('Invalid screenshot data URL, skipping image in clipboard');
          await navigator.clipboard.writeText(markdown);
          setOpen(false);
          return;
        }

        // Create HTML that includes both image (as base64 data URL) and text
        // Note: We don't include image/png separately because apps will prefer it over text
        const htmlContent = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
<img src="${enrichedContext.screenshot}" alt="Element Screenshot" style="max-width: min(100%, 37.5rem); display: block; margin-bottom: 1rem; border-radius: 0.5rem; box-shadow: 0 0.125rem 0.5rem rgba(0,0,0,0.1);">
<pre style="font-family: 'SF Mono', Monaco, 'Courier New', monospace; font-size: 0.75rem; white-space: pre-wrap; background: #f6f8fa; padding: 1rem; border-radius: 0.375rem; border: 1px solid #e1e4e8; overflow-x: auto;">${markdown.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
</div>`;

        // Copy HTML + text/plain (NO image/png to avoid preference issue)
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([htmlContent], { type: 'text/html' }),
            'text/plain': new Blob([markdown], { type: 'text/plain' }),
          }),
        ]);
      } else {
        // No screenshot - just copy text
        await navigator.clipboard.writeText(markdown);
      }
      setOpen(false);
    } catch (err) {
      // Fallback to text-only if clipboard.write fails
      console.warn('Clipboard copy failed, falling back to text-only:', err);
      try {
        await navigator.clipboard.writeText(markdown);
        // Notify user that screenshot couldn't be copied
        const event = new CustomEvent('inspector-notification', {
          detail: { message: '⚠️ Screenshot not copied - only text was copied to clipboard' }
        });
        window.dispatchEvent(event);
        setOpen(false);
      } catch {
        console.error('Failed to copy to clipboard');
      }
    }
  };

  const handleSubmit = (continueInspecting: boolean) => {
    if (onSubmit) {
      const enrichedContext = hasContext ? prepareEnrichedContext() : undefined;
      onSubmit(feedback, continueInspecting, enrichedContext);
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
              screenshot={screenshot}
              onDataReady={handleDataReady}
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
