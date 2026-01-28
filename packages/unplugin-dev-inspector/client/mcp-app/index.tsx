import React from "react";
import { createRoot } from "react-dom/client";
import { ContextSelectorApp } from "./ContextSelectorApp";
import "../styles.css"; // Reuse main styles for Tailwind

const root = createRoot(document.getElementById("root")!);
root.render(<ContextSelectorApp />);
