import type { InspectedElement, ReactFiber } from "./types";

/**
 * Generate DOM path from element to root
 */
function getDomPath(element: Element): string {
  const path: string[] = [];
  let current: Element | null = element;

  while (current && current.nodeType === Node.ELEMENT_NODE) {
    let selector = current.tagName.toLowerCase();

    if (current.id) {
      selector += `#${current.id}`;
      path.unshift(selector);
      break; // ID is unique, stop here
    } else if (current.className && typeof current.className === "string") {
      const classes = current.className.trim().split(/\s+/).slice(0, 2); // Limit to 2 classes for readability
      if (classes.length > 0 && classes[0]) {
        selector += `.${classes.join(".")}`;
      }
    }

    path.unshift(selector);
    current = current.parentElement;

    // Limit depth to prevent overly long paths
    if (path.length >= 10) break;
  }

  return path.join(" > ");
}

function getElementInfo(element: Element) {
  const computedStyles = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();

  // Legacy flat styles for backwards compatibility
  const legacyStyles = {
    display: computedStyles.display,
    position: computedStyles.position,
    width: computedStyles.width,
    height: computedStyles.height,
    backgroundColor: computedStyles.backgroundColor,
    color: computedStyles.color,
    fontSize: computedStyles.fontSize,
    padding: computedStyles.padding,
    margin: computedStyles.margin,
    border: computedStyles.border,
  };

  return {
    tagName: element.tagName.toLowerCase(),
    textContent: element.textContent?.trim().slice(0, 100) || "",
    className: element.className || "",
    id: element.id || "",
    attributes: Array.from(element.attributes).reduce(
      (acc, attr) => {
        if (!attr.name.startsWith("data-") && attr.name !== "class" && attr.name !== "id") {
          acc[attr.name] = attr.value;
        }
        return acc;
      },
      {} as Record<string, string>,
    ),
    styles: legacyStyles, // Keep for backwards compatibility
    domPath: getDomPath(element),
    boundingBox: {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
      right: rect.right,
      bottom: rect.bottom,
      x: rect.x,
      y: rect.y,
    },
    // Categorized computed styles for better organization
    computedStyles: {
      layout: {
        display: computedStyles.display,
        position: computedStyles.position,
        width: computedStyles.width,
        height: computedStyles.height,
        overflow: computedStyles.overflow,
        overflowX: computedStyles.overflowX,
        overflowY: computedStyles.overflowY,
        float: computedStyles.float,
        clear: computedStyles.clear,
        zIndex: computedStyles.zIndex,
      },
      typography: {
        fontFamily: computedStyles.fontFamily,
        fontSize: computedStyles.fontSize,
        fontWeight: computedStyles.fontWeight,
        fontStyle: computedStyles.fontStyle,
        lineHeight: computedStyles.lineHeight,
        textAlign: computedStyles.textAlign,
        textDecoration: computedStyles.textDecoration,
        textTransform: computedStyles.textTransform,
        letterSpacing: computedStyles.letterSpacing,
        wordSpacing: computedStyles.wordSpacing,
        color: computedStyles.color,
      },
      spacing: {
        padding: computedStyles.padding,
        paddingTop: computedStyles.paddingTop,
        paddingRight: computedStyles.paddingRight,
        paddingBottom: computedStyles.paddingBottom,
        paddingLeft: computedStyles.paddingLeft,
        margin: computedStyles.margin,
        marginTop: computedStyles.marginTop,
        marginRight: computedStyles.marginRight,
        marginBottom: computedStyles.marginBottom,
        marginLeft: computedStyles.marginLeft,
      },
      background: {
        backgroundColor: computedStyles.backgroundColor,
        backgroundImage: computedStyles.backgroundImage,
        backgroundSize: computedStyles.backgroundSize,
        backgroundPosition: computedStyles.backgroundPosition,
        backgroundRepeat: computedStyles.backgroundRepeat,
      },
      border: {
        border: computedStyles.border,
        borderTop: computedStyles.borderTop,
        borderRight: computedStyles.borderRight,
        borderBottom: computedStyles.borderBottom,
        borderLeft: computedStyles.borderLeft,
        borderRadius: computedStyles.borderRadius,
        borderColor: computedStyles.borderColor,
        borderWidth: computedStyles.borderWidth,
        borderStyle: computedStyles.borderStyle,
      },
      effects: {
        opacity: computedStyles.opacity,
        visibility: computedStyles.visibility,
        boxShadow: computedStyles.boxShadow,
        textShadow: computedStyles.textShadow,
        filter: computedStyles.filter,
        transform: computedStyles.transform,
        transition: computedStyles.transition,
        animation: computedStyles.animation,
      },
      flexbox: {
        flexDirection: computedStyles.flexDirection,
        flexWrap: computedStyles.flexWrap,
        justifyContent: computedStyles.justifyContent,
        alignItems: computedStyles.alignItems,
        alignContent: computedStyles.alignContent,
        flex: computedStyles.flex,
        flexGrow: computedStyles.flexGrow,
        flexShrink: computedStyles.flexShrink,
        flexBasis: computedStyles.flexBasis,
        order: computedStyles.order,
      },
      grid: {
        gridTemplateColumns: computedStyles.gridTemplateColumns,
        gridTemplateRows: computedStyles.gridTemplateRows,
        gridTemplateAreas: computedStyles.gridTemplateAreas,
        gridGap: computedStyles.gap,
        gridColumnGap: computedStyles.columnGap,
        gridRowGap: computedStyles.rowGap,
        gridAutoFlow: computedStyles.gridAutoFlow,
        gridAutoColumns: computedStyles.gridAutoColumns,
        gridAutoRows: computedStyles.gridAutoRows,
      },
    },
  };
}

export const getSourceInfo = (element: Element): InspectedElement => {
  // First, try to get data-source attribute directly
  let current: Element | null = element;
  const maxDepth = 20;
  let depth = 0;

  // Check current element and parents for data-source or data-insp-path attribute
  while (current && depth < maxDepth) {
    const dataSource = current.getAttribute("data-source");
    const inspPath = current.getAttribute("data-insp-path");

    if (inspPath) {
      // Parse data-insp-path format: "file:line:col:tag"
      const parts = inspPath.split(":");
      if (parts.length >= 4) {
        const tag = parts.pop() || "";
        const col = parts.pop() || "0";
        const line = parts.pop() || "0";
        const file = parts.join(":");

        return {
          file: file,
          component: tag || element.tagName.toLowerCase(),
          apis: [],
          line: parseInt(line, 10),
          column: parseInt(col, 10),
          element,
          elementInfo: getElementInfo(element),
        };
      }
    }

    if (dataSource) {
      // Parse data-source format: "file:line:col"
      const parts = dataSource.split(":");
      if (parts.length >= 3) {
        const col = parts.pop() || "0";
        const line = parts.pop() || "0";
        const file = parts.join(":"); // Re-join in case file path contains colons

        return {
          file: file,
          component: element.tagName.toLowerCase(),
          apis: [],
          line: parseInt(line, 10),
          column: parseInt(col, 10),
          element,
          elementInfo: getElementInfo(element),
        };
      }
    }
    current = current.parentElement;
    depth++;
  }

  // Fallback to React Fiber detection
  current = element;
  depth = 0;

  while (current && depth < maxDepth) {
    const fiberKey = Object.keys(current as any).find(
      (key) =>
        key.startsWith("__reactInternalInstance") ||
        key.startsWith("__reactFiber") ||
        key.startsWith("__react"),
    );

    if (fiberKey) {
      let fiber: ReactFiber | undefined = (current as any)[fiberKey];

      while (fiber) {
        if (fiber.type && typeof fiber.type === "function") {
          const componentName: string = fiber.type.name || fiber.type.displayName || "Anonymous";
          if (componentName && componentName !== "Anonymous" && componentName !== "") {
            const metadata =
              (window as any).__SOURCE_INSPECTOR__ &&
              (window as any).__SOURCE_INSPECTOR__[componentName];
            if (metadata) {
              return {
                ...metadata,
                element,
                elementInfo: getElementInfo(element),
              };
            }
            return {
              file: "unknown",
              component: componentName,
              apis: [],
              line: 0,
              column: 0,
              element,
              elementInfo: getElementInfo(element),
            };
          }
        }
        fiber = fiber._owner || fiber.return;
      }
    }

    current = current.parentElement;
    depth++;
  }

  return {
    file: "unknown",
    component: element.tagName.toLowerCase(),
    apis: [],
    line: 0,
    column: 0,
    element,
    elementInfo: getElementInfo(element),
  };
};
