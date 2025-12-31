import React, { createContext, useContext, useEffect, useState } from "react";



// Simplified to only expose resolved theme (dark/light) based on system preference
interface InspectorThemeContextType {
  resolvedTheme: "dark" | "light";
}

const InspectorThemeContext = createContext<InspectorThemeContextType | undefined>(undefined);

export const useInspectorTheme = () => {
  const context = useContext(InspectorThemeContext);
  if (!context) {
    throw new Error("useInspectorTheme must be used within an InspectorThemeProvider");
  }
  return context;
};

export const InspectorThemeProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  // Always track system preference
  const [resolvedTheme, setResolvedTheme] = useState<"dark" | "light">(() => {
    if (typeof window === "undefined") return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e: MediaQueryListEvent) => {
      setResolvedTheme(e.matches ? "dark" : "light");
    };

    // Listen for changes
    media.addEventListener("change", handleChange);

    // Ensure we are in sync on mount/updates
    setResolvedTheme(media.matches ? "dark" : "light");

    return () => media.removeEventListener("change", handleChange);
  }, []);

  return (
    <InspectorThemeContext.Provider value={{ resolvedTheme }}>
      {children}
    </InspectorThemeContext.Provider>
  );
};
