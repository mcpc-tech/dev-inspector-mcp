/// <reference types="vite/client" />

interface ElectronAPI {
  resizeWindow: (width: number, height: number) => void;
  getServerPort: () => Promise<number>;
}

interface Window {
  electronAPI?: ElectronAPI;
}
