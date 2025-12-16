import { contextBridge, ipcRenderer } from 'electron';

// Expose safe IPC bridge to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  // Window control
  resizeWindow: (width: number, height: number) => {
    ipcRenderer.send('resize-window', width, height);
  },
  
  // Get server port
  getServerPort: () => {
    return ipcRenderer.invoke('get-server-port');
  },
});
