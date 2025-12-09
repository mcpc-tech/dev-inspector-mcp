import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import DevInspector from '@mcpc-tech/unplugin-dev-inspector-mcp'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    DevInspector.vite({
      enabled: true,
      autoOpenBrowser: true
    }),
    svelte()
  ],
})
