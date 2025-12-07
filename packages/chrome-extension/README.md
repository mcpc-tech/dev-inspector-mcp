# Dev Inspector Chrome Extension

Chrome extension that brings dev-inspector functionality to any webpage using native messaging for ACP communication.

## Installation

### 1. Install Native Messaging Host

```bash
cd packages/native-messaging-host
pnpm install
pnpm build
node dist/install.js
```

**Important**: After running `install.js`, you need to update the extension ID in the manifest file.

### 2. Build Chrome Extension

```bash
cd packages/chrome-extension
pnpm install
pnpm build
```

### 3. Load Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select `packages/chrome-extension/dist` directory
5. **Copy the extension ID** (it looks like `abcdefghijklmnopqrstuvwxyz123456`)

### 4. Update Native Host Manifest

1. On macOS, open:
   ```
   ~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.mcpc_tech.dev_inspector.json
   ```

2. Replace `EXTENSION_ID_PLACEHOLDER` with your actual extension ID

3. Reload the extension in Chrome

## Usage

1. Click the extension icon in Chrome toolbar
2. Click "Capture Element" button
3. Hover over any element on the page
4. Click to capture element info
5. The captured data will be sent to ACP agent for inspection

## Architecture

```
Chrome Extension  →  Native Messaging Host  →  ACP Agent (Claude Code/Cline)
   (UI + Inspector)     (stdio protocol)         (AI analysis)
```

## Development

**Native Host**:
```bash
cd packages/native-messaging-host
pnpm dev  # Watch mode
```

**Extension**:
```bash
cd packages/chrome-extension
pnpm dev  # Watch mode
```

After changes, reload the extension in `chrome://extensions`.

## Troubleshooting

**Native host won't connect:**
- Check `chrome://extensions` for error messages
- Verify manifest file has correct extension ID
- Check native host path in manifest is correct

**Element capture not working:**
- Open DevTools console to see errors
- Check content script is loaded on the page
- Verify activeTab permission is granted
