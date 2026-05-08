const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('miyagi', {
  appName: 'Miyagi',
  createProject: () => ipcRenderer.invoke('project:create'),
  openProject: (projectPath) => ipcRenderer.invoke('project:open', projectPath),
  readFile: (filePath) => ipcRenderer.invoke('file:read', filePath),
})
