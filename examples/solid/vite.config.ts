import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import DevInspector from '@mcpc-tech/unplugin-dev-inspector-mcp';

export default defineConfig({
  plugins: [DevInspector.vite({
    enabled: true,
    autoOpenBrowser: true,
  }),
  solid()],
})
