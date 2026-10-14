const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('env', {
  // Add safe values here if needed in renderer
});

contextBridge.exposeInMainWorld('api', {
  // Triggers the main process to copy the bundled installer to a user-chosen location
  downloadApp: async () => {
    return await ipcRenderer.invoke('app:download-installer');
  }
});
