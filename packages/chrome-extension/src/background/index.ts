/**
 * Background service worker for Chrome extension
 * Injects the inspector client script from the running dev-inspector server
 */

const SERVER_HOST = 'localhost';
const SERVER_PORT = 8888;
const SERVER_BASE = `http://${SERVER_HOST}:${SERVER_PORT}`;

/**
 * Inject the inspector script into the current tab
 */
async function injectInspector(tab: chrome.tabs.Tab) {
    if (!tab.id) return;

    try {
        // 1. Check if server is reachable and script exists
        const scriptUrl = `${SERVER_BASE}/__inspector__/inspector.iife.js`;
        try {
            const response = await fetch(scriptUrl, { method: 'HEAD' });
            if (!response.ok) {
                throw new Error(`Server returned ${response.status} ${response.statusText}`);
            }
        } catch (error) {
            console.error('[background] Failed to connect to dev-inspector server:', error);
            // Notify user via alert script injection
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: (host, port) => {
                    alert(`Failed to connect to Dev Inspector server at http://${host}:${port}\n\nPlease make sure the server is running:\n npx dev-inspector-server --port ${port}`);
                },
                args: [SERVER_HOST, SERVER_PORT]
            });
            return;
        }

        console.log('[background] Injecting inspector into tab', tab.id);

        // 2. Inject configuration
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            world: 'MAIN', // Inject into main world to share window object
            func: (host, port) => {
                // @ts-ignore
                window.__DEV_INSPECTOR_CONFIG__ = {
                    host: host,
                    port: port,
                    base: '/'
                };
                console.log('[Dev Inspector] Configuration injected');
            },
            args: [SERVER_HOST, SERVER_PORT]
        });

        // 3. Inject the loader script that adds the script tag
        // We inject a loader that creates a script tag pointing to the server
        // This ensures the page loads the module/script from the server context
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            world: 'MAIN',
            func: (baseUrl) => {
                if (document.querySelector('dev-inspector-mcp')) {
                    console.log('[Dev Inspector] Already injected');
                    return;
                }

                // Create web component container
                const inspector = document.createElement('dev-inspector-mcp');
                document.body.appendChild(inspector);

                // Create and append script
                const script = document.createElement('script');
                script.src = `${baseUrl}/__inspector__/inspector.iife.js`;
                // script.type = 'module'; // It's an IIFE build now, not module
                script.crossOrigin = 'anonymous';

                script.onload = () => {
                    console.log('[Dev Inspector] Script loaded successfully');
                    // Trigger activation event if needed
                    window.dispatchEvent(new CustomEvent('activate-inspector'));
                };

                script.onerror = (e) => {
                    console.error('[Dev Inspector] Failed to load script', e);
                };

                document.head.appendChild(script);
            },
            args: [SERVER_BASE]
        });

    } catch (error) {
        console.error('[background] Injection failed:', error);
    }
}

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
    injectInspector(tab);
});

export { };
