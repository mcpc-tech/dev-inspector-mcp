import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import DevInspector from "@mcpc-tech/unplugin-dev-inspector-mcp";

export default defineConfig({
  plugins: [
    DevInspector.vite({
      enabled: true,
      entry: "app/root.tsx",
    }),
    tailwindcss(),
    reactRouter(),
    tsconfigPaths(),
  ],
});
