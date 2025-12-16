import { app, BrowserWindow, ipcMain, screen } from 'electron';
import { join, resolve } from 'path';
import { spawn, type ChildProcess } from 'child_process';

let mainWindow: BrowserWindow | null = null;
let serverProcess: ChildProcess | null = null;
let serverPort = 8888;

// Find the CLI script path in monorepo
function getCliPath(): string {
  // In development, use the local package
  const monorepoRoot = resolve(__dirname, '../../../../');
  return join(monorepoRoot, 'packages/unplugin-dev-inspector/dist/cli.js');
}

// Start the dev-inspector standalone server
function startServer(): Promise<number> {
  return new Promise((resolve, reject) => {
    const cliPath = getCliPath();
    console.log('[DynamicIsland] CLI path:', cliPath);
    
    // Use node to run the CLI directly
    serverProcess = spawn('node', [
      cliPath,
      'server',
      '--port', 
      String(serverPort)
    ], {
      cwd: process.cwd(),
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    serverProcess.stdout?.on('data', (data) => {
      const output = data.toString();
      console.log('[dev-inspector-server]', output);
      
      // Check if server started successfully
      if (output.includes('MCP (Standalone)')) {
        resolve(serverPort);
      }
    });

    serverProcess.stderr?.on('data', (data) => {
      console.error('[dev-inspector-server error]', data.toString());
    });

    serverProcess.on('error', (error) => {
      console.error('[dev-inspector-server] Failed to start:', error);
      reject(error);
    });

    serverProcess.on('exit', (code) => {
      console.log('[dev-inspector-server] Process exited with code:', code);
      serverProcess = null;
    });

    // Timeout if server doesn't start
    setTimeout(() => {
      reject(new Error('Server start timeout'));
    }, 30000);
  });
}

function createWindow() {
  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;
  
  const windowWidth = 500;
  const windowHeight = 100;
  const x = Math.round((screenWidth - windowWidth) / 2);
  const y = 50; // Move down a bit for visibility

  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: -100, y: -100 },
    roundedCorners: true,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // IPC: Resize window
  ipcMain.on('resize-window', (_event, width: number, height: number) => {
    if (mainWindow) {
      const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;
      const newX = Math.round((screenWidth - width) / 2);
      mainWindow.setBounds({ x: newX, y: 12, width, height });
    }
  });

  // IPC: Get server port
  ipcMain.handle('get-server-port', () => serverPort);

  // Load the renderer
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
    // Open DevTools for debugging
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Cleanup server on exit
function cleanup() {
  if (serverProcess) {
    console.log('[dev-inspector-server] Stopping server...');
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }
}

app.whenReady().then(async () => {
  try {
    console.log('[DynamicIsland] Starting dev-inspector server...');
    await startServer();
    console.log(`[DynamicIsland] Server running on port ${serverPort}`);
  } catch (error) {
    console.error('[DynamicIsland] Failed to start server, proceeding anyway:', error);
  }
  
  createWindow();
});

app.on('window-all-closed', () => {
  cleanup();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  cleanup();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
