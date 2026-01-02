import type {
  ConsoleMessage,
  InspectedElement,
  NetworkRequest,
  StdioMessage,
} from "../types";

/**
 * Format DOM element info only (for Code tab)
 */
export function formatDomElement(
  elementInfo: InspectedElement["elementInfo"],
): string {
  if (!elementInfo) return "";

  const { tagName, textContent, className, id: elemId, domPath, boundingBox } =
    elementInfo;
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
- **Size**: ${Math.round(boundingBox.width)}px × ${
      Math.round(boundingBox.height)
    }px
`;
  }

  return output;
}

/**
 * Format computed styles only (for Styles tab)
 */
export function formatComputedStyles(
  elementInfo: InspectedElement["elementInfo"],
): string {
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
      const levelIcon = msg.level === "error"
        ? "❌"
        : msg.level === "warn"
        ? "⚠️"
        : "📝";
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
 * Format stdio messages
 */
export function formatStdioMessages(messages: StdioMessage[]): string {
  if (messages.length === 0) return "";

  const formatted = messages
    .map((msg) => {
      return `- [${msg.stream}] ${msg.data}`;
    })
    .join("\n");

  return `## Terminal Logs (${messages.length})
${formatted}
`;
}

/**
 * Format typography styles only
 */
export function formatTypography(
  typography: NonNullable<
    InspectedElement["elementInfo"]
  >["computedStyles"]["typography"],
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
  stdioMessages?: StdioMessage[];
  relatedElements?: InspectedElement[];
  relatedElementIds?: number[];
}): string {
  const {
    sourceInfo,
    includeElement,
    includeStyles,
    feedback,
    consoleMessages,
    networkRequests,
    stdioMessages,
    relatedElements,
    relatedElementIds,
  } = options;

  let output = "# Element Context\n\n";

  const hasRelatedElements = relatedElements &&
    relatedElements.length > 0 &&
    relatedElementIds &&
    relatedElementIds.length > 0;

  if (sourceInfo && includeElement) {
    output += "## Code\n\n";

    // For Region Selection, label the primary element
    if (hasRelatedElements) {
      output += "### Primary Element (Best Match)\n";
    }

    output += formatSourceInfo(sourceInfo);
    output += "\n";
    output += formatDomElement(sourceInfo.elementInfo);
    output += "\n";
  }

  // == Related Elements (Region Selection) ==
  if (
    relatedElements &&
    relatedElements.length > 0 &&
    relatedElementIds &&
    relatedElementIds.length > 0
  ) {
    const selectedElements = relatedElements.filter((_, idx) =>
      relatedElementIds.includes(idx)
    );
    if (selectedElements.length > 0) {
      output += "## Related Elements\n\n";

      // Group by file
      const grouped = selectedElements.reduce(
        (acc, el) => {
          const file = el.file || "unknown";
          if (!acc[file]) acc[file] = [];
          acc[file].push(el);
          return acc;
        },
        {} as Record<string, InspectedElement[]>,
      );

      Object.entries(grouped).forEach(([file, elements]) => {
        output += `### ${file}\n`;
        elements.forEach((el) => {
          output += `- **${el.component}** (${el.line}:${el.column})`;
          if (el.elementInfo?.tagName) {
            output += ` - \`<${el.elementInfo.tagName}`;
            // Add className if available
            if (el.elementInfo.className) {
              output += ` class="${el.elementInfo.className}"`;
            }
            // Add id if available
            if (el.elementInfo.id) {
              output += ` id="${el.elementInfo.id}"`;
            }
            output += `>`;
            // Add text content preview if available
            if (el.elementInfo.textContent) {
              const preview = el.elementInfo.textContent.trim().slice(0, 30);
              if (preview) {
                output += ` "${preview}${
                  el.elementInfo.textContent.length > 30 ? "..." : ""
                }"`;
              }
            }
            output += "`";
          }
          output += "\n";
        });
        output += "\n";
      });
    }
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
    output += "\n";
  }

  // == Stdio Tab ==
  if (stdioMessages && stdioMessages.length > 0) {
    output += formatStdioMessages(stdioMessages);
  }

  return output.trim();
}
