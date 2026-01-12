import React from "react";
import { Loader2, CheckCircle2, XCircle, X } from "lucide-react";

export type InspectionStatus = "pending" | "in-progress" | "completed" | "failed";

// Serializable version without Element references
export interface SourceInfo {
  file: string;
  component: string;
  line: number;
  column?: number;
  elementInfo?: {
    tagName: string;
    textContent: string;
    className: string;
    id: string;
    styles: Record<string, string>;
  };
  relatedElements?: SourceInfo[];
}

export interface InspectionItem {
  id: string;
  sourceInfo: SourceInfo;
  description: string;
  status: InspectionStatus;
  progress?: {
    steps: Array<{
      id: number;
      title: string;
      status: "pending" | "in-progress" | "completed" | "failed";
    }>;
  };
  result?: string;
  timestamp: number;
  /** User-selected context from Console/Network tabs (with enriched data) */
  selectedContext?: {
    includeElement: boolean;
    includeStyles: boolean;
    consoleIds: number[];
    networkIds: number[];
    consoleMessages?: Array<{
      msgid: number;
      level: string;
      text: string;
      timestamp?: number;
    }>;
    networkRequests?: Array<{
      reqid: number;
      method: string;
      url: string;
      status: string;
      timestamp?: number;
      details?: string | null;
    }>;
    screenshot?: string;
  };
}

interface InspectionQueueProps {
  items: InspectionItem[];
  onRemove: (id: string) => void;
}

export const InspectionQueue: React.FC<InspectionQueueProps> = ({ items, onRemove }) => {
  if (items.length === 0) return null;

  const getStatusIcon = (status: InspectionStatus) => {
    if (status === "in-progress") return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
    if (status === "completed") return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    if (status === "failed") return <XCircle className="h-4 w-4 text-red-500" />;
    return <div className="h-4 w-4 rounded-full border-2 border-gray-400" />;
  };

  const getStatusText = (item: InspectionItem) => {
    if (item.status === "in-progress" && item.progress?.steps) {
      const completed = item.progress.steps.filter((s) => s.status === "completed").length;
      return `Processing... ${completed}/${item.progress.steps.length}`;
    }
    if (item.status === "completed") return "Completed";
    if (item.status === "failed") return "Failed";
    if (item.status === "in-progress") return "In Progress";
    return "Pending";
  };

  return (
    <div className="w-full bg-card overflow-hidden h-full">
      <div className="h-full overflow-y-auto">
        {items.map((item) => {
          // Calculate context summary
          const ctx = item.selectedContext;
          const contextParts: string[] = [];
          if (ctx?.includeElement) contextParts.push("Code");
          if (ctx?.includeStyles) contextParts.push("Styles");
          if (ctx?.consoleIds?.length) contextParts.push(`Console (${ctx.consoleIds.length})`);
          if (ctx?.networkIds?.length) contextParts.push(`Network (${ctx.networkIds.length})`);

          return (
            <div
              key={item.id}
              className="px-4 py-3 border-b border-border hover:bg-accent/50 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">{getStatusIcon(item.status)}</div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">
                        {item.sourceInfo.component}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {item.sourceInfo.file}:{item.sourceInfo.line}
                        {item.sourceInfo.column !== undefined ? `:${item.sourceInfo.column}` : ""}
                      </p>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemove(item.id);
                      }}
                      className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <p className="text-xs text-foreground/80 mt-1 line-clamp-2">{item.description}</p>

                  {/* Context Summary */}
                  {contextParts.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {contextParts.map((part) => (
                        <span
                          key={part}
                          className="px-1.5 py-0.5 text-[10px] bg-accent text-muted-foreground rounded"
                        >
                          {part}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-muted-foreground">{getStatusText(item)}</span>

                    {item.status === "in-progress" && item.progress?.steps && (
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 transition-all duration-300"
                          style={{
                            width: `${(item.progress.steps.filter((s) => s.status === "completed").length / item.progress.steps.length) * 100}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>

                  {(item.status === "completed" || item.status === "failed") && item.result && (
                    <p
                      className={`text-xs mt-1 ${item.status === "failed" ? "text-destructive" : "text-muted-foreground"}`}
                    >
                      {item.result}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
