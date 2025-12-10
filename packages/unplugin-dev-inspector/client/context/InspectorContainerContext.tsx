import { createContext, useContext } from "react";

/**
 * Context for Portal components to access the Shadow DOM root or container element
 */
export const InspectorContainerContext = createContext<HTMLElement | ShadowRoot | null>(null);

/**
 * Hook to access the inspector container (Shadow DOM root or regular DOM container)
 */
export const useInspectorContainer = () => useContext(InspectorContainerContext);

/**
 * Alias for backward compatibility with existing components
 */
export const useShadowRoot = useInspectorContainer;
