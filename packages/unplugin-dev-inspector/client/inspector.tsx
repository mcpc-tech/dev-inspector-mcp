import React, { useState, useRef, useEffect, useCallback } from "react";
import type { InspectedElement } from "./types";
import { initInterceptors } from "./lib/interceptor";
import { Notification } from "./components/Notification";
import { FeedbackBubble } from "./components/FeedbackBubble";
import type { SelectedContext } from "./components/ContextPicker";
import { type InspectionItem } from "./components/InspectionQueue";
import { Overlay, Tooltip } from "./components/Overlays";
import { useNotification } from "./hooks/useNotification";
import { useInspectorHover } from "./hooks/useInspectorHover";
import { useInspectorClick } from "./hooks/useInspectorClick";
import { useMcp } from "./hooks/useMcp";
import { Toaster } from "./components/ui/sonner";
import { cn } from "./lib/utils";
import { useInspectorTheme } from "./context/ThemeContext";
import { InspectorContainerContext } from "./context/InspectorContainerContext";
import { useInspectionProgress } from "./hooks/useInspectionProgress";
import { captureElementScreenshot } from "./utils/screenshot";
import { saveInspectionItems, loadInspectionItems } from "./utils/inspectionStorage";
import { getSourceInfo } from "./sourceDetector";
import inspectorStyles from "./styles.css";
import ReactDOM from "react-dom/client";
import { InspectorThemeProvider } from "./context/ThemeContext";
import { InspectorBar } from "./components/InspectorBar";
import { RegionOverlay } from "./components/RegionOverlay";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { getDevServerBaseUrl, getShowInspectorBar } from "./utils/config-loader";

interface InspectorContainerProps {
  shadowRoot?: ShadowRoot;
  mountPoint?: HTMLElement;
}

const InspectorContainer: React.FC<InspectorContainerProps> = ({ shadowRoot, mountPoint }) => {
  const { client, isClientReady } = useMcp();
  const { resolvedTheme } = useInspectorTheme();
  const showInspectorBar = getShowInspectorBar();

  const [isActive, setIsActive] = useState(false);
  const [sourceInfo, setSourceInfo] = useState<InspectedElement | null>(null);
  const [screenshot, setScreenshot] = useState<string>("");
  const [bubbleMode, setBubbleMode] = useState<"input" | null>(null);
  const { inspections, setInspections } = useInspectionProgress();
  const [currentSessionInspections, setCurrentSessionInspections] = useState<InspectionItem[]>([]);
  const [selectedAgentName, setSelectedAgentName] = useState<string | null>(null);
  const [regionMode, setRegionMode] = useState(false);

  // Agent State
  const { messages, sendMessage, status, stop } = useChat({
    transport: new DefaultChatTransport({
      api: `${getDevServerBaseUrl()}/api/acp/chat`,
    }),
  });

  const handleCancel = () => {
    stop();
  };

  const overlayRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null); // Kept for hooks but not rendered

  const { notification, showNotif } = useNotification();

  useEffect(() => {
    if (shadowRoot && shadowRoot.host) {
      if (resolvedTheme === "dark") {
        shadowRoot.host.classList.add("dark");
      } else {
        shadowRoot.host.classList.remove("dark");
      }
    }
  }, [resolvedTheme, shadowRoot]);

  useEffect(() => {
    const activeInspectionId = sessionStorage.getItem("inspector-current-inspection-id");
    if (!activeInspectionId) return;

    const inspectionExists = inspections.some((item) => item.id === activeInspectionId);
    if (!inspectionExists) {
      sessionStorage.removeItem("inspector-current-inspection-id");
    }
  }, [inspections]);

  // Toggle inspector mode - defined as useCallback to be used in keyboard shortcut effect
  const toggleInspector = useCallback(() => {
    const newActive = !isActive;
    setIsActive(newActive);

    // Reset region mode when toggling inspector
    setRegionMode(false);

    document.body.style.cursor = newActive ? "crosshair" : "";

    if (newActive) {
      setBubbleMode(null);
    } else {
      if (overlayRef.current) overlayRef.current.style.display = "none";
      if (tooltipRef.current) tooltipRef.current.style.display = "none";
      setBubbleMode(null);
    }

    showNotif(newActive ? "Inspector ON" : "Inspector OFF");
  }, [isActive, showNotif]);

  const handleBubbleClose = useCallback(() => {
    setBubbleMode(null);
    setIsActive(false);
    setRegionMode(false);
    document.body.style.cursor = "";

    if (overlayRef.current) overlayRef.current.style.display = "none";
    if (tooltipRef.current) tooltipRef.current.style.display = "none";
  }, []);

  const toggleRegionMode = useCallback(() => {
    if (!isActive) {
      // If inspector is off, turn it on and enable region mode
      setIsActive(true);
      setRegionMode(true);
      setBubbleMode(null);
      showNotif("Region Mode: ON");
      return;
    }

    const newMode = !regionMode;
    setRegionMode(newMode);

    if (newMode) {
      setBubbleMode(null); // Close any active bubble
      document.body.style.cursor = "default"; // Region overlay handles cursor
    } else {
      document.body.style.cursor = "crosshair"; // Back to element picking
    }
  }, [isActive, regionMode, showNotif]);

  // KISS: Simplified keyboard shortcut handling - standard React pattern
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape to close inspector
      if (e.key === "Escape" && isActive) {
        handleBubbleClose();
        return;
      }

      // Alt/Option + I to toggle inspector
      const isToggleShortcut =
        e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.code === "KeyI";

      if (isToggleShortcut) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        toggleInspector();
      }

      // Alt/Option + S to toggle region mode
      const isRegionShortcut =
        e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.code === "KeyS";

      if (isRegionShortcut) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        toggleRegionMode();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [isActive, toggleInspector, handleBubbleClose, toggleRegionMode]);

  useEffect(() => {
    const handleActivateInspector = () => {
      if (!isActive) {
        setIsActive(true);
        document.body.style.cursor = "crosshair";
        setBubbleMode(null);
        showNotif("Inspector ON");
      }
    };

    window.addEventListener("activate-inspector", handleActivateInspector);
    return () => window.removeEventListener("activate-inspector", handleActivateInspector);
  }, [isActive, showNotif]);

  // MCP: Handle area selection activation from capture_area_context tool
  useEffect(() => {
    const handleActivateAreaSelect = () => {
      // Activate inspector in region mode
      setIsActive(true);
      setRegionMode(true);
      setBubbleMode(null);
      document.body.style.cursor = "default"; // Region overlay handles cursor
      showNotif("Area Mode: ON");
    };

    window.addEventListener("activate-area-select", handleActivateAreaSelect);
    return () => window.removeEventListener("activate-area-select", handleActivateAreaSelect);
  }, [showNotif]);

  // MCP: Handle automated capture from capture_context tool with selector/containerSelector/bounds
  useEffect(() => {
    const handleAutomatedCapture = async (e: Event) => {
      const customEvent = e as CustomEvent<{
        selector?: string;
        containerSelector?: string;
        bounds?: { x: number; y: number; width: number; height: number };
      }>;
      const { selector, containerSelector, bounds } = customEvent.detail || {};

      let elements: Element[] = [];
      let primaryElement: Element | null = null;

      try {
        if (selector) {
          // Single element by selector
          const el = document.querySelector(selector);
          if (el) {
            primaryElement = el;
            elements = [el];
          }
        } else if (containerSelector) {
          // All elements within container
          const container = document.querySelector(containerSelector);
          if (container) {
            primaryElement = container;
            // Get all interactive/meaningful children
            const children = container.querySelectorAll("*");
            elements = [container, ...Array.from(children).filter(el => {
              // Filter to meaningful elements (not empty, has content or is interactive)
              const tag = el.tagName.toLowerCase();
              const isInteractive = ["button", "a", "input", "select", "textarea", "img", "video", "audio"].includes(tag);
              const hasText = el.textContent?.trim();
              const hasId = el.id;
              const hasClass = el.className;
              return isInteractive || hasText || hasId || hasClass;
            }).slice(0, 50)]; // Limit to 50 elements
          }
        } else if (bounds) {
          // Elements within bounds
          const { x, y, width, height } = bounds;
          const allElements = document.querySelectorAll("*");
          elements = Array.from(allElements).filter(el => {
            const rect = el.getBoundingClientRect();
            // Check if element intersects with bounds
            return (
              rect.left < x + width &&
              rect.right > x &&
              rect.top < y + height &&
              rect.bottom > y &&
              rect.width > 0 &&
              rect.height > 0
            );
          }).slice(0, 50); // Limit to 50 elements

          // Use the first element as primary
          primaryElement = elements[0] || null;
        }

        if (!primaryElement || elements.length === 0) {
          // Dispatch error event
          window.dispatchEvent(new CustomEvent("element-inspected", {
            detail: { error: "No elements found matching the criteria" }
          }));
          return;
        }

        // Get source info for primary element
        const primaryInfo = getSourceInfo(primaryElement);

        // Get related elements info (excluding primary)
        const relatedElements = elements.slice(1).map(el => {
          const info = getSourceInfo(el);
          return {
            file: info.file,
            component: info.component,
            line: info.line,
            column: info.column,
            elementInfo: info.elementInfo,
          };
        });

        // Capture screenshot
        let screenshot: string | undefined;
        if (primaryElement.isConnected) {
          screenshot = await captureElementScreenshot(primaryElement);
        }

        // Create inspection item
        const inspectionId = `inspection-${Date.now()}`;
        const description = selector
          ? `Auto-captured: ${selector}`
          : containerSelector
            ? `Auto-captured container: ${containerSelector} (${elements.length} elements)`
            : `Auto-captured bounds: ${bounds?.width}x${bounds?.height} at (${bounds?.x}, ${bounds?.y}) (${elements.length} elements)`;

        const newItem: InspectionItem = {
          id: inspectionId,
          sourceInfo: {
            file: primaryInfo.file,
            component: primaryInfo.component,
            line: primaryInfo.line,
            column: primaryInfo.column,
            elementInfo: primaryInfo.elementInfo,
            relatedElements: relatedElements.length > 0 ? relatedElements : undefined,
          },
          description,
          status: "pending",
          timestamp: Date.now(),
          selectedContext: {
            includeElement: true,
            includeStyles: false,
            consoleIds: [],
            networkIds: [],
            screenshot,
          },
        };

        setInspections(prev => [...prev, newItem]);

        // Sync to localStorage before event (React setState is async)
        saveInspectionItems([...loadInspectionItems(), newItem]);

        // Dispatch for MCP tool to receive
        window.dispatchEvent(new CustomEvent("element-inspected", {
          detail: { inspections: [newItem] }
        }));

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        window.dispatchEvent(new CustomEvent("element-inspected", {
          detail: { error: `Automated capture failed: ${errorMsg}` }
        }));
      }
    };

    window.addEventListener("automated-capture", handleAutomatedCapture);
    return () => window.removeEventListener("automated-capture", handleAutomatedCapture);
  }, [setInspections]);


  useInspectorHover({
    isActive: isActive && !regionMode, // Disable hover when in region mode
    isWaitingForFeedback: bubbleMode !== null,
    overlayRef,
    tooltipRef,
    btnRef,
  });

  const handleElementInspected = async (info: InspectedElement) => {
    // Capture screenshot BEFORE dialog opens (KISS: capture timing fix)
    // Wait for next frame and a short delay to let UI settle and avoid race conditions
    if (info.element) {
      const element = info.element;
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          setTimeout(resolve, 50);
        });
      });

      if (element.isConnected) {
        const dataUrl = await captureElementScreenshot(element);
        setScreenshot(dataUrl);
      } else {
        setScreenshot("");
      }
    }

    setSourceInfo(info);

    // Auto-save in automated mode
    if (info.automated) {
      const inspectionId = `inspection-${Date.now()}`;
      const newItem: InspectionItem = {
        id: inspectionId,
        sourceInfo: {
          file: info.file,
          component: info.component,
          line: info.line,
          column: info.column,
          elementInfo: info.elementInfo,
        },
        description: "Auto-captured via automation",
        status: "pending",
        timestamp: Date.now(),
      };

      setInspections((prev) => [...prev, newItem]);

      // Dispatch immediately for automated mode
      window.dispatchEvent(
        new CustomEvent("element-inspected", {
          detail: {
            inspections: [newItem],
          },
        }),
      );

      setIsActive(false);
      document.body.style.cursor = "";
      if (overlayRef.current) overlayRef.current.style.display = "none";
      if (tooltipRef.current) tooltipRef.current.style.display = "none";
      // Automated mode - no notification needed
    } else {
      // Manual mode - show input bubble
      setBubbleMode("input");
      if (overlayRef.current) overlayRef.current.style.display = "none";
      if (tooltipRef.current) tooltipRef.current.style.display = "none";
    }
  };

  // Listen for automated inspection events from MCP tools
  useEffect(() => {
    const handleCustomInspect = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        // Support both direct detail or detail.info structure
        const info = customEvent.detail.info || customEvent.detail;
        if (info && info.file) {
          handleElementInspected({ ...info, automated: true });
        }
      }
    };

    window.addEventListener("dev-inspector:inspect-element", handleCustomInspect);
    return () => window.removeEventListener("dev-inspector:inspect-element", handleCustomInspect);
  }, []); // Dependencies relying on state setters which are stable

  useInspectorClick({
    isActive: isActive && !regionMode, // Disable click picking in region mode
    isWaitingForFeedback: bubbleMode !== null,
    onElementInspected: handleElementInspected,
    btnRef,
  });

  const handleInspectionSubmit = (description: string, continueInspecting = false, context?: SelectedContext) => {
    if (!sourceInfo) return;

    // Detect if we have related elements (Region capture)
    const isRegionCapture = sourceInfo.relatedElements && sourceInfo.relatedElements.length > 0;

    // Construct description for region capture if not provided
    let defaultDescription = description;
    if (!defaultDescription && isRegionCapture) {
      const count = (sourceInfo.relatedElements?.length || 0) + 1;
      const primary = sourceInfo.elementInfo?.tagName.toLowerCase() || 'element';

      // Check if any notes exist to add AI hint
      const hasNotes = sourceInfo.note || sourceInfo.relatedElements?.some(el => el.note);
      const actionHint = hasNotes ? ". Please read notes on these elements." : "";

      defaultDescription = `Region: ${count} elements (primary: ${primary})${actionHint}`;
    }

    const finalDescription = defaultDescription || description;

    const inspectionId = `inspection-${Date.now()}`;
    const newItem: InspectionItem = {
      id: inspectionId,
      sourceInfo: {
        file: sourceInfo.file,
        component: sourceInfo.component,
        line: sourceInfo.line,
        column: sourceInfo.column,
        elementInfo: sourceInfo.elementInfo,

        relatedElements: sourceInfo.relatedElements?.map(el => ({
          file: el.file,
          component: el.component,
          line: el.line,
          column: el.column,
          elementInfo: el.elementInfo ? {
            tagName: el.elementInfo.tagName,
            textContent: el.elementInfo.textContent,
            className: el.elementInfo.className,
            id: el.elementInfo.id,
            styles: el.elementInfo.styles || {},
          } : undefined,
          note: el.note
        })),
      },
      description: finalDescription,
      status: "pending",
      timestamp: Date.now(),
      selectedContext: context,
    };

    setInspections((prev) => [...prev, newItem]);

    // Add to current session inspections
    const updatedSessionInspections = [...currentSessionInspections, newItem];
    setCurrentSessionInspections(updatedSessionInspections);

    setBubbleMode(null);

    if (continueInspecting) {
      // Keep inspector active for continued inspection
      // Don't dispatch event yet - wait for final submit
      setIsActive(true);
      document.body.style.cursor = "crosshair";
      showNotif(`Saved (${updatedSessionInspections.length})`);
    } else {
      // Sync to localStorage before event (React setState is async)
      saveInspectionItems([...loadInspectionItems(), ...updatedSessionInspections]);

      // Final submit - dispatch all inspections from this session as an array
      window.dispatchEvent(
        new CustomEvent("element-inspected", {
          detail: {
            inspections: updatedSessionInspections,
          },
        }),
      );

      // Clear session inspections
      setCurrentSessionInspections([]);
      setIsActive(false);
      document.body.style.cursor = "";
      showNotif(`${updatedSessionInspections.length} inspection${updatedSessionInspections.length > 1 ? 's' : ''} saved`);
    }
  };



  const handleAgentSubmit = (query: string, agent: any, sessionId?: string) => {
    sendMessage(
      { text: query },
      {
        body: {
          agent,
          envVars: {},
          sessionId,
        },
      },
    );
  };

  const handleRegionSelectionComplete = async (info: InspectedElement) => {
    // Capture screenshot of the primary element
    if (info.element && info.element.isConnected) {
      const dataUrl = await captureElementScreenshot(info.element);
      setScreenshot(dataUrl);
    } else {
      setScreenshot("");
    }

    // MCP: Dispatch event for capture_area_context tool to receive selection
    window.dispatchEvent(
      new CustomEvent("area-selection-complete", {
        detail: { sourceInfo: info },
      }),
    );

    setSourceInfo(info);
    setBubbleMode("input");
    setRegionMode(false); // Turn off region mode after selection
    setIsActive(false); // Stop inspector to focus on bubble

    // Show notification
    const count = (info.relatedElements?.length || 0) + 1;
    showNotif(`Region: ${count} elements`);
  };

  const handleRemoveInspection = (id: string) => {
    setInspections((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <div
      className={cn(
        "font-sans antialiased w-full h-full pointer-events-none fixed inset-0",
        resolvedTheme === "dark" && "dark",
      )}
    >
      <InspectorContainerContext.Provider value={mountPoint || null}>
        <div className="pointer-events-auto">
          {showInspectorBar && (
            <InspectorBar
              toolsReady={isClientReady}
              mcpClient={client}
              isActive={isActive}
              onToggleInspector={toggleInspector}
              onSubmitAgent={handleAgentSubmit}
              onCancel={handleCancel}
              isAgentWorking={status === "streaming" || status === "submitted"}
              messages={messages}
              status={status}
              inspectionCount={inspections.length}
              inspectionItems={inspections}
              onRemoveInspection={handleRemoveInspection}
              onAgentChange={setSelectedAgentName}
              onToggleRegionMode={toggleRegionMode}
              isRegionModeActive={regionMode}
            />
          )}
        </div>

        {isActive && regionMode && (
          <RegionOverlay
            isActive={true}
            onSelectionComplete={handleRegionSelectionComplete}
            onCancel={() => setRegionMode(false)}
            onClose={toggleInspector}
          />
        )}

        <Overlay ref={overlayRef} visible={isActive && bubbleMode === null && !regionMode} />
        <Tooltip ref={tooltipRef} visible={isActive && bubbleMode === null && !regionMode} />

        {notification && <Notification message={notification} />}

        {bubbleMode && sourceInfo && (
          <div className="pointer-events-auto">
            <FeedbackBubble
              sourceInfo={sourceInfo}
              screenshot={screenshot}
              mode={bubbleMode}
              onSubmit={handleInspectionSubmit}
              onClose={handleBubbleClose}
              client={client as any}
              isClientReady={isClientReady}
              selectedAgent={selectedAgentName || undefined}
            />
          </div>
        )}

        <Toaster />
      </InspectorContainerContext.Provider>
    </div>
  );
};

class DevInspector extends HTMLElement {
  connectedCallback() {
    // CRITICAL: Set host element styles to ensure it's always on top
    // This fixes Shadow DOM stacking context conflicts with user page elements
    this.style.cssText = `
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 100% !important;
      height: 100% !important;
      pointer-events: none !important;
      z-index: 2147483647 !important;
    `;

    const shadowRoot = this.attachShadow({ mode: "open" });

    const styleElement = document.createElement("style");
    styleElement.textContent = inspectorStyles;
    shadowRoot.appendChild(styleElement);

    const mountPoint = document.createElement("div");
    shadowRoot.appendChild(mountPoint);

    const reactRoot = ReactDOM.createRoot(mountPoint);
    reactRoot.render(
      React.createElement(
        InspectorThemeProvider,
        null,
        React.createElement(InspectorContainer, {
          shadowRoot,
          mountPoint,
        }),
      ),
    );

    // Initialize interceptors if configured
    // @ts-ignore - Config injected by server
    const config = window.__DEV_INSPECTOR_CONFIG__;
    initInterceptors({
      disableChrome: config?.disableChrome,
    });
  }
}

export * from "./context/InspectorContainerContext";

export function registerDevInspector() {
  if (!customElements.get("dev-inspector-mcp")) {
    customElements.define("dev-inspector-mcp", DevInspector as CustomElementConstructor);
  }
}

registerDevInspector();
