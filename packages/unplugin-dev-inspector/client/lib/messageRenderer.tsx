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

type UITool = { name?: string };
type UIMessagePart<TMeta = Record<string, unknown>, TToolMap = Record<string, UITool>> =
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
                        className={`text-sm ${
                          status === "done"
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
                        className={`px-2 py-1 rounded-full font-medium text-[10px] uppercase tracking-wide ${
                          status === "pending"
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
    const removeBrand = (title: string) => {
      // ai sdk tools
      title = title.replace("acp-ai-sdk-tools", "");
      return title;
    };
    const toolInput = part.input as ProviderAgentDynamicToolInput;
    const toolType = removeBrand(toolInput.toolName) as `tool-${string}`;
    const toolState = part.state as
      | "input-streaming"
      | "input-available"
      | "output-available"
      | "output-error";
    const hasOutput = toolState === "output-available" || toolState === "output-error";

    // Truncate tool title if too long
    const maxTitleLength = 20;
    const displayTitle =
      toolType.length > maxTitleLength ? `${toolType.slice(0, maxTitleLength)}...` : toolType;

    return (
      <Tool key={`${messageId}-${index}`} defaultOpen={hasOutput}>
        <ToolHeader title={removeBrand(displayTitle)} type={toolType} state={toolState} />
        <ToolContent>
          {part.input !== undefined && <ToolInput input={toolInput} />}
          {hasOutput && (
            <ToolOutput
              output={
                part.output ? (
                  <CodeBlock code={JSON.stringify(part.output, null, 2)} language="json" />
                ) : null
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
