import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "../../src/components/ai-elements/reasoning";
import { MessageResponse } from "../../src/components/ai-elements/message";
import {
  Tool,
  ToolHeader,
  ToolContent,
  ToolInput,
  ToolOutput,
} from "../../src/components/ai-elements/tool";
import { Plan, PlanHeader, PlanContent, PlanTrigger } from "../../src/components/ai-elements/plan";
import { CodeBlock } from "../../src/components/ai-elements/code-block";
import type { ProviderAgentDynamicToolInput } from "@mcpc-tech/acp-ai-provider";

// MCP content item types
interface McpTextContent {
  type: "text";
  text: string;
}

interface McpImageContent {
  type: "image";
  data: string;
  mimeType: string;
}

type McpContentItem = McpTextContent | McpImageContent | Record<string, unknown>;

/**
 * Render MCP content items (supports text and image types)
 */
function renderMcpContent(output: unknown, keyPrefix: string): React.ReactNode {
  // Check if output has MCP content array structure
  if (
    output &&
    typeof output === "object" &&
    "content" in output &&
    Array.isArray((output as { content: unknown[] }).content)
  ) {
    const contentItems = (output as { content: McpContentItem[] }).content;
    return renderMcpContentItems(contentItems, keyPrefix);
  }

  // Handle case where ACP provider wraps content array in a JSON string
  // Output format: { type: "text", text: "[{\"type\":\"text\",...}, ...]" }
  if (
    output &&
    typeof output === "object" &&
    "type" in output &&
    (output as any).type === "text" &&
    "text" in output &&
    typeof (output as any).text === "string"
  ) {
    try {
      const text = (output as any).text;
      if (text.trim().startsWith("[") && text.trim().endsWith("]")) {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          return renderMcpContentItems(parsed as McpContentItem[], keyPrefix);
        }
      }
    } catch {
      // Ignore parse errors and fall back to default rendering
    }
  }

  // Fallback: render as JSON
  return <CodeBlock code={JSON.stringify(output, null, 2)} language="json" />;
}

function renderMcpContentItems(contentItems: McpContentItem[], keyPrefix: string) {
  return (
    <div className="space-y-2">
      {contentItems.map((item, idx) => {
        if (item.type === "text" && "text" in item) {
          const textItem = item as McpTextContent;
          return (
            <CodeBlock
              key={`${keyPrefix}-text-${idx}`}
              code={textItem.text}
              language="markdown"
            />
          );
        }
        if (item.type === "image" && "data" in item && "mimeType" in item) {
          const imageItem = item as McpImageContent;
          const src = `data:${imageItem.mimeType};base64,${imageItem.data}`;
          return (
            <div key={`${keyPrefix}-image-${idx}`} className="rounded-md overflow-hidden">
              <img
                src={src}
                alt="MCP tool result"
                className="max-w-full h-auto rounded-md border border-border"
                style={{ maxHeight: "300px", objectFit: "contain" }}
              />
            </div>
          );
        }
        // Fallback for other content types
        return (
          <CodeBlock
            key={`${keyPrefix}-other-${idx}`}
            code={JSON.stringify(item, null, 2)}
            language="json"
          />
        );
      })}
    </div>
  );
}

type UITool = { name?: string };
type UIMessagePart<TMeta = Record<string, unknown>, _TToolMap = Record<string, UITool>> =
  | {
    type: "text";
    text: string;
    state?: string;
    providerMetadata?: TMeta;
  }
  | {
    type: "reasoning";
    text: string;
    state?: string;
    providerMetadata?: TMeta;
  }
  | (Record<string, unknown> & {
    type: string;
    state?: string;
  });

/**
 * Normalize tool name by stripping provider prefixes and namespaces
 */
export function normalizeToolName(rawName: string): string {
  let name = rawName;

  // Some providers include prefixes/namespaces that we don't want to show in UI.
  name = name.replace(/^tool-/, "");
  name = name.replace(/^mcp__/, "");

  // Strip ACP AI SDK tools branding across common separators.
  // Examples:
  // - mcp__acp_ai_sdk_tools__show_alert
  // - acp-ai-sdk-tools/show_alert
  name = name.replace(/(^|__|\/)(acp[-_]?ai[-_]?sdk[-_]?tools)(?=__|\/|$)/g, "$1");

  // Normalize repeated separators.
  name = name.replace(/^__+/, "").replace(/__+$/, "");
  name = name.replace(/__{3,}/g, "__");

  return name || rawName;
}

function isToolPart(part: unknown): part is Record<string, unknown> & {
  type: string;
  state: string;
} {
  const p = part as Record<string, unknown>;
  return typeof p.type === "string" && p.type.startsWith("tool-") && "state" in p;
}

export function renderMessagePart(
  part: UIMessagePart,
  messageId: string,
  index: number,
  isStreaming: boolean,
  metadata?: Record<string, unknown>,
) {
  // Render text content
  if (part.type === "text" && part.text) {
    return (
      <MessageResponse key={`${messageId}-${index}`} className="whitespace-pre-wrap">
        {part.text as string}
      </MessageResponse>
    );
  }

  // Render reasoning/thinking process
  if (part.type === "reasoning") {
    return (
      <Reasoning key={`${messageId}-${index}`} className="w-full" isStreaming={isStreaming}>
        <ReasoningTrigger />
        <ReasoningContent>{part.text}</ReasoningContent>
      </Reasoning>
    );
  }

  // Render plan from message metadata
  const plan = metadata?.plan as Array<Record<string, unknown>> | undefined;
  if (plan && index === 0) {
    return (
      <div key={`${messageId}-plan`} className="w-full">
        <Plan defaultOpen isStreaming={isStreaming}>
          <PlanHeader className="flex flex-row items-center">
            <>
              <h1 className="text-base">Agent Plan</h1>
              <PlanTrigger className="mb-2" />
            </>
          </PlanHeader>
          <PlanContent>
            <ul className="space-y-2">
              {plan.map((item, i) => {
                const content = (item.content as string) || JSON.stringify(item);
                const priority = item.priority as string | undefined;
                const status = item.status as string | undefined;

                return (
                  <li key={`plan-${i}`} className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div
                        className={`text-sm ${status === "done"
                          ? "line-through text-muted-foreground"
                          : "text-foreground"
                          }`}
                      >
                        {content}
                      </div>
                      {priority && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          Priority: {priority}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 text-xs">
                      <span
                        className={`px-2 py-1 rounded-full font-medium text-[10px] uppercase tracking-wide ${status === "pending"
                          ? "bg-muted text-muted-foreground"
                          : "bg-primary/10 text-primary"
                          }`}
                      >
                        {status ?? "pending"}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </PlanContent>
        </Plan>
      </div>
    );
  }

  // Handle tool calls with type starting with "tool-"
  if (isToolPart(part)) {
    const toolInput = part.input as ProviderAgentDynamicToolInput | undefined;

    // Guard clause: skip rendering if input or toolName is missing
    if (!toolInput || !toolInput.toolName) {
      return null;
    }

    const normalizedToolName = normalizeToolName(toolInput.toolName);
    const toolType = `tool-${normalizedToolName}` as `tool-${string}`;
    const toolState = part.state as
      | "input-streaming"
      | "input-available"
      | "output-available"
      | "output-error";
    const hasOutput = toolState === "output-available" || toolState === "output-error";

    // Truncate tool title if too long
    const maxTitleLength = 20;
    const displayTitle =
      normalizedToolName.length > maxTitleLength
        ? `${normalizedToolName.slice(0, maxTitleLength)}...`
        : normalizedToolName;

    return (
      <Tool key={`${messageId}-${index}`} defaultOpen={hasOutput}>
        <ToolHeader title={displayTitle} type={toolType} state={toolState} />
        <ToolContent>
          {part.input !== undefined && <ToolInput input={toolInput.args} />}
          {hasOutput && (
            <ToolOutput
              output={
                part.output ? renderMcpContent(part.output, `${messageId}-${index}`) : null
              }
              errorText={part.errorText as string | undefined}
            />
          )}
        </ToolContent>
      </Tool>
    );
  }

  return null;
}
