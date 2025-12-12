import React, { useState, useRef, useEffect, useCallback } from "react";
import type { InspectedElement } from "./types";
import { Notification } from "./components/Notification";
import { FeedbackBubble } from "./components/FeedbackBubble";
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
  useMcp();
  const { resolvedTheme } = useInspectorTheme();
  const showInspectorBar = getShowInspectorBar();

  const [isActive, setIsActive] = useState(false);
  const [sourceInfo, setSourceInfo] = useState<InspectedElement | null>(null);
  const [bubbleMode, setBubbleMode] = useState<"input" | null>(null);
  const { inspections, setInspections } = useInspectionProgress();

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

    showNotif(newActive ? "🔍 Inspector ON - Click any element (⌥I)" : "✅ Inspector OFF");
  }, [isActive, showNotif]);

  // Stable handler ref to avoid re-binding listener on state changes
  // This prevents the "gap" where keypress events can slip through during re-render
  const handleKeyDownRef = useRef<(e: KeyboardEvent) => void>(undefined);

  // Update the ref with the latest closure
  useEffect(() => {
    handleKeyDownRef.current = (e: KeyboardEvent) => {
      // Escape to close inspector
      if (e.key === "Escape" && isActive) {
        handleBubbleClose();
        return;
      }

      // Keyboard shortcuts to toggle inspector:
      // - Alt/Option + I (I for Inspector) - Use e.code to handle keyboard layouts and macOS Option key char transformations
      const isToggleShortcut =
        e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.code === "KeyI";

      if (isToggleShortcut) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation(); // Ensure no other listeners see this
        toggleInspector();
      }
    };
  });

  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (handleKeyDownRef.current) {
        handleKeyDownRef.current(e);
      }
    };

    window.addEventListener("keydown", listener, true);
    return () => window.removeEventListener("keydown", listener, true);
  }, []); // Bind once, never remove

  useEffect(() => {
    const handleActivateInspector = () => {
      if (!isActive) {
        setIsActive(true);
        document.body.style.cursor = "crosshair";
        setBubbleMode(null);
        showNotif("🔍 Inspector ON - Click any element");
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

  useInspectorClick({
    isActive,
    isWaitingForFeedback: bubbleMode !== null,
    onElementInspected: (info) => {
      setSourceInfo(info);
      setBubbleMode("input");

      if (overlayRef.current) overlayRef.current.style.display = "none";
      if (tooltipRef.current) tooltipRef.current.style.display = "none";
    },
    btnRef,
  });

  const handleInspectionSubmit = (description: string) => {
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
    };

    setInspections((prev) => [...prev, newItem]);

    // Dispatch the element-inspected event to resolve the MCP tool promise
    window.dispatchEvent(
      new CustomEvent("element-inspected", {
        detail: {
          sourceInfo: newItem.sourceInfo,
          description,
          inspectionId,
        },
      }),
    );

    setBubbleMode(null);
    setIsActive(false);
    document.body.style.cursor = "";

    showNotif("✅ Inspection saved");
  };

  const handleBubbleClose = () => {
    setBubbleMode(null);
    setIsActive(false);
    document.body.style.cursor = "";

    if (overlayRef.current) overlayRef.current.style.display = "none";
    if (tooltipRef.current) tooltipRef.current.style.display = "none";
  };

  const handleAgentSubmit = (query: string, agentName: string) => {
    const currentAgent = AVAILABLE_AGENTS.find((a) => a.name === agentName) || AVAILABLE_AGENTS[0];
    sendMessage(
      { text: query },
      {
        body: {
          agent: currentAgent,
          envVars: {},
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
              mode={bubbleMode}
              onSubmit={handleInspectionSubmit}
              onClose={handleBubbleClose}
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
