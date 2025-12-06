import React from 'react';
import { Loader2, CheckCircle2, XCircle, X } from 'lucide-react';

export type InspectionStatus = 'pending' | 'in-progress' | 'completed' | 'failed';

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
      status: 'pending' | 'in-progress' | 'completed' | 'failed';
    }>;
  };
  result?: string;
  timestamp: number;
}

interface InspectionQueueProps {
  items: InspectionItem[];
  onRemove: (id: string) => void;
}

export const InspectionQueue: React.FC<InspectionQueueProps> = ({ items, onRemove }) => {
  if (items.length === 0) return null;

  const getStatusIcon = (status: InspectionStatus) => {
    if (status === 'in-progress') return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
    if (status === 'completed') return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    if (status === 'failed') return <XCircle className="h-4 w-4 text-red-500" />;
    return <div className="h-4 w-4 rounded-full border-2 border-gray-400" />;
  };

  const getStatusText = (item: InspectionItem) => {
    if (item.status === 'in-progress' && item.progress?.steps) {
      const completed = item.progress.steps.filter(s => s.status === 'completed').length;
      return `Processing... ${completed}/${item.progress.steps.length}`;
    }
    if (item.status === 'completed') return 'Completed';
    if (item.status === 'failed') return 'Failed';
    if (item.status === 'in-progress') return 'In Progress';
    return 'Pending';
  };

  return (
    <div
      className="w-full bg-card overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="bg-muted px-4 py-3 border-b border-border">
        <h3 className="font-semibold text-sm text-foreground">
          Inspection Queue ({items.length})
        </h3>
      </div>

      <div className="max-h-96 overflow-y-auto">
        {items.map((item) => (
          <div
            key={item.id}
            className="px-4 py-3 border-b border-border hover:bg-accent/50 transition-colors"
          >
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                {getStatusIcon(item.status)}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">
                      {item.sourceInfo.component}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {item.sourceInfo.file}:{item.sourceInfo.line}{item.sourceInfo.column !== undefined ? `:${item.sourceInfo.column}` : ''}
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

                <p className="text-xs text-foreground/80 mt-1 line-clamp-2">
                  {item.description}
                </p>

                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-muted-foreground">
                    {getStatusText(item)}
                  </span>

                  {item.status === 'in-progress' && item.progress?.steps && (
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 transition-all duration-300"
                        style={{
                          width: `${(item.progress.steps.filter(s => s.status === 'completed').length / item.progress.steps.length) * 100}%`
                        }}
                      />
                    </div>
                  )}
                </div>

                {(item.status === 'completed' || item.status === 'failed') && item.result && (
                  <p className={`text-xs mt-1 ${item.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {item.result}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
