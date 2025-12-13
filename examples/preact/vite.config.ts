import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import DevInspector from "@mcpc-tech/unplugin-dev-inspector-mcp";

// https://vite.dev/config/
export default defineConfig({
  plugins: [DevInspector.vite(
    {

    }
  ), preact()],
});
