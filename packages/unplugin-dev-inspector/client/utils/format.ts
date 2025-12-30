import type { InspectedElement, ConsoleMessage, NetworkRequest } from "../types";

/**
 * Format DOM element info only (for Code tab)
 */
export function formatDomElement(elementInfo: InspectedElement["elementInfo"]): string {
  if (!elementInfo) return "";

  const { tagName, textContent, className, id: elemId, domPath, boundingBox } = elementInfo;
  const idAttr = elemId ? ` id="${elemId}"` : "";
  const classAttr = className ? ` class="${className}"` : "";

  let output = `### DOM Element
\`\`\`
Tag: <${tagName}${idAttr}${classAttr}>
Text: ${textContent || "(empty)"}
Path: ${domPath || "N/A"}
\`\`\`
`;

  if (boundingBox) {
    output += `
### Position & Size
- **Position**: (${Math.round(boundingBox.x)}, ${Math.round(boundingBox.y)})
- **Size**: ${Math.round(boundingBox.width)}px × ${Math.round(boundingBox.height)}px
`;
  }

  return output;
}

/**
 * Format computed styles only (for Styles tab)
 */
export function formatComputedStyles(elementInfo: InspectedElement["elementInfo"]): string {
  if (!elementInfo) return "";

  const { computedStyles, styles } = elementInfo;

  if (computedStyles) {
    return `### Computed Styles

**Layout**:
- display: ${computedStyles.layout.display}
- position: ${computedStyles.layout.position}
- z-index: ${computedStyles.layout.zIndex}

**Typography**:
- font: ${computedStyles.typography.fontSize} ${computedStyles.typography.fontFamily}
- color: ${computedStyles.typography.color}
- text-align: ${computedStyles.typography.textAlign}

**Spacing**:
- padding: ${computedStyles.spacing.padding}
- margin: ${computedStyles.spacing.margin}

**Background & Border**:
- background: ${computedStyles.background.backgroundColor}
- border: ${computedStyles.border.border}
- border-radius: ${computedStyles.border.borderRadius}
`;
  } else if (styles) {
    return `### Key Styles
- display: ${styles.display}
- color: ${styles.color}
- background: ${styles.backgroundColor}
- font-size: ${styles.fontSize}
`;
  }

  return "";
}

/**
 * Format element info for Markdown output (legacy compatibility)
 */
export function formatElementInfo(
  elementInfo: InspectedElement["elementInfo"],
  includeStyles = true,
): string {
  if (!elementInfo) return "";
  let output = formatDomElement(elementInfo);
  if (includeStyles) {
    output += formatComputedStyles(elementInfo);
  }
  return output;
}

/**
 * Format source location
 */
export function formatSourceInfo(sourceInfo: InspectedElement): string {
  return `## Source Code
- **File**: ${sourceInfo.file}
- **Line**: ${sourceInfo.line}:${sourceInfo.column}
- **Component**: ${sourceInfo.component}
`;
}

/**
 * Format console messages
 */
export function formatConsoleMessages(messages: ConsoleMessage[]): string {
  if (messages.length === 0) return "";

  const formatted = messages
    .map((msg) => {
      const levelIcon = msg.level === "error" ? "❌" : msg.level === "warn" ? "⚠️" : "📝";
      return `- ${levelIcon} [${msg.level}] ${msg.text}`;
    })
    .join("\n");

  return `## Console Messages (${messages.length})
${formatted}
`;
}

/**
 * Format network requests
 */
export function formatNetworkRequests(
  requests: Array<NetworkRequest & { details?: string | null }>,
): string {
  if (requests.length === 0) return "";

  const formatted = requests
    .map((req) => {
      let entry = `### ${req.method} ${req.url}
- **Status**: ${req.status}
`;
      if (req.details && req.details !== "(expand request to load details)") {
        entry += `
#### Details
\`\`\`
${req.details}
\`\`\`
`;
      }
      return entry;
    })
    .join("\n");

  return `## Network Requests (${requests.length})
${formatted}
`;
}

/**
 * Format typography styles only
 */
export function formatTypography(
  typography: NonNullable<InspectedElement["elementInfo"]>["computedStyles"]["typography"],
): string {
  if (!typography) return "";

  return `## Typography Styles
- font-family: ${typography.fontFamily}
- font-size: ${typography.fontSize}
- font-weight: ${typography.fontWeight}
- color: ${typography.color}
- line-height: ${typography.lineHeight}
- text-align: ${typography.textAlign}
`;
}

/**
 * Format complete context for Copy & Go (matches ContextPicker tab structure)
 */
export function formatCopyContext(options: {
  sourceInfo?: InspectedElement;
  includeElement?: boolean;
  includeStyles?: boolean;
  feedback?: string;
  consoleMessages?: ConsoleMessage[];
  networkRequests?: Array<NetworkRequest & { details?: string | null }>;
}): string {
  const { sourceInfo, includeElement, includeStyles, feedback, consoleMessages, networkRequests } =
    options;

  let output = "# Element Context\n\n";

  // == Code Tab ==
  if (sourceInfo && includeElement) {
    output += "## Code\n\n";
    output += formatSourceInfo(sourceInfo);
    output += "\n";
    output += formatDomElement(sourceInfo.elementInfo);
    output += "\n";
  }

  // == Styles Tab ==
  if (sourceInfo?.elementInfo && includeStyles) {
    output += "## Styles\n\n";
    output += formatComputedStyles(sourceInfo.elementInfo);
    output += "\n";
  }

  // == User Request ==
  if (feedback) {
    output += `## User Request\n\n${feedback}\n\n`;
  }

  // == Console Tab ==
  if (consoleMessages && consoleMessages.length > 0) {
    output += formatConsoleMessages(consoleMessages);
    output += "\n";
  }

  // == Network Tab ==
  if (networkRequests && networkRequests.length > 0) {
    output += formatNetworkRequests(networkRequests);
  }

  return output.trim();
}
