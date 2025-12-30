import React, { useState, useRef, useEffect, useCallback } from "react";
import type { InspectedElement } from "./types";
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
import inspectorStyles from "./styles.css";
import ReactDOM from "react-dom/client";
import { InspectorThemeProvider } from "./context/ThemeContext";
import { InspectorBar } from "./components/InspectorBar";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { AVAILABLE_AGENTS } from "./constants/agents";
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

    document.body.style.cursor = newActive ? "crosshair" : "";

    if (newActive) {
      setBubbleMode(null);
    } else {
      if (overlayRef.current) overlayRef.current.style.display = "none";
      if (tooltipRef.current) tooltipRef.current.style.display = "none";
      setBubbleMode(null);
    }

    showNotif(newActive ? "🔍 Inspector ON - Click any element" : "Inspector OFF");
  }, [isActive, showNotif]);

  const handleBubbleClose = useCallback(() => {
    setBubbleMode(null);
    setIsActive(false);
    document.body.style.cursor = "";

    if (overlayRef.current) overlayRef.current.style.display = "none";
    if (tooltipRef.current) tooltipRef.current.style.display = "none";
  }, []);

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
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [isActive, toggleInspector, handleBubbleClose]);

  useEffect(() => {
    const handleActivateInspector = () => {
      if (!isActive) {
        setIsActive(true);
        document.body.style.cursor = "crosshair";
        setBubbleMode(null);
        showNotif("🔍 Inspector ON");
      }
    };

    window.addEventListener("activate-inspector", handleActivateInspector);
    return () => window.removeEventListener("activate-inspector", handleActivateInspector);
  }, [isActive, showNotif]);

  useInspectorHover({
    isActive,
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
      showNotif("✅ Element captured automatically");
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
    isActive,
    isWaitingForFeedback: bubbleMode !== null,
    onElementInspected: handleElementInspected,
    btnRef,
  });

  const handleInspectionSubmit = (description: string, continueInspecting = false, context?: SelectedContext) => {
    if (!sourceInfo) return;

    const inspectionId = `inspection-${Date.now()}`;
    const newItem: InspectionItem = {
      id: inspectionId,
      sourceInfo: {
        file: sourceInfo.file,
        component: sourceInfo.component,
        line: sourceInfo.line,
        column: sourceInfo.column,
        elementInfo: sourceInfo.elementInfo,
      },
      description,
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
      showNotif(`✅ Saved (${updatedSessionInspections.length}) - Click next element`);
    } else {
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
      showNotif(`✅ ${updatedSessionInspections.length} inspection${updatedSessionInspections.length > 1 ? 's' : ''} saved`);
    }
  };



  const handleAgentSubmit = (query: string, agentName: string, sessionId?: string) => {
    const currentAgent = AVAILABLE_AGENTS.find((a) => a.name === agentName) || AVAILABLE_AGENTS[0];
    sendMessage(
      { text: query },
      {
        body: {
          agent: currentAgent,
          envVars: {},
          sessionId,
        },
      },
    );
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
            />
          )}
        </div>

        <Overlay ref={overlayRef} visible={isActive && bubbleMode === null} />
        <Tooltip ref={tooltipRef} visible={isActive && bubbleMode === null} />

        {notification && <Notification message={notification} />}

        {bubbleMode && sourceInfo && (
          <div className="pointer-events-auto">
            <FeedbackBubble
              sourceInfo={sourceInfo}
              screenshot={screenshot}
              mode={bubbleMode}
              onSubmit={handleInspectionSubmit}
              onClose={handleBubbleClose}
              client={client}
              isClientReady={isClientReady}
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
  }
}

export * from "./context/InspectorContainerContext";

export function registerDevInspector() {
  if (!customElements.get("dev-inspector-mcp")) {
    customElements.define("dev-inspector-mcp", DevInspector as CustomElementConstructor);
  }
}

registerDevInspector();
