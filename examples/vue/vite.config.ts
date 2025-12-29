import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import DevInspector from "@mcpc-tech/unplugin-dev-inspector-mcp";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    DevInspector.vite({
      enabled: true,
      autoInject: false,
      autoOpenBrowser: true,
    }),
  ],
});
