const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("bridge", {
  getDefaultTarget: () => ipcRenderer.invoke("codex:target"),
  listThreads: () => ipcRenderer.invoke("codex:threads:list"),
  predictTarget: payload => ipcRenderer.invoke("codex:threads:predict", payload),
  queueToCodex: payload => ipcRenderer.invoke("codex:queue", payload),
});
