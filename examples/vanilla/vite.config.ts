import { defineConfig } from "vite";
import DevInspector from "@mcpc-tech/unplugin-dev-inspector-mcp";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    DevInspector.vite({
      enabled: true,
      autoOpenBrowser: true
    }),
  ],
});
