const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlayAPI', {
  toggleOnTop:    () => ipcRenderer.invoke('overlay:toggleOnTop'),
  addMarker:      (marker) => ipcRenderer.invoke('overlay:addMarker', marker),
  getApiKey:      () => ipcRenderer.invoke('overlay:getApiKey'),
  startRecording: () => ipcRenderer.invoke('overlay:startRecording'),
  stopRecording:  () => ipcRenderer.invoke('overlay:stopRecording'),
  openTeams:      () => ipcRenderer.invoke('overlay:openTeams'),
  // Listen for forwarded AppEvents from the main renderer
  onEvent: (cb) => ipcRenderer.on('overlay:event', (_, payload) => cb(payload)),
});
