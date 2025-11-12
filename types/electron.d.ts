// TypeScript declarations for Electron preload API

interface ElectronAPI {
  downloadApp: () => Promise<boolean>;
}

declare global {
  interface Window {
    api?: ElectronAPI;
  }
}

export {};
