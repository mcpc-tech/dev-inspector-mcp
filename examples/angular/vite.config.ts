import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';
import DevInspector from '@mcpc-tech/unplugin-dev-inspector-mcp';

// https://vitejs.dev/config/
export default defineConfig({
    resolve: {
        mainFields: ['module'],
    },
    plugins: [

        // Angular plugin (docs say it should be first, but testing DevInspector first)
        angular(),
        // Try DevInspector first for better source location tracking
        DevInspector.vite({
            enabled: true,
            autoOpenBrowser: true,
        }),
    ],
});
