const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("bridge", {
  getDefaultTarget: () => ipcRenderer.invoke("codex:target"),
  listThreads: () => ipcRenderer.invoke("codex:threads:list"),
  predictTarget: payload => ipcRenderer.invoke("codex:threads:predict", payload),
  queueToCodex: payload => ipcRenderer.invoke("codex:queue", payload),
  onFocusComposer: callback => {
    const listener = () => callback();
    ipcRenderer.on("codex:focus-composer", listener);
    return () => ipcRenderer.removeListener("codex:focus-composer", listener);
  },
  onShortcutStatus: callback => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on("codex:shortcut-status", listener);
    return () => ipcRenderer.removeListener("codex:shortcut-status", listener);
  },
});
