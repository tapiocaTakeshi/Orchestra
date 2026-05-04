   contextBridge.exposeInMainWorld('aiChat', {
     send: (prompt) => ipcRenderer.invoke('ai:send', prompt),
     onChunk: (cb) => { const h = (_e, p) => cb(p); ipcRenderer.on('ai:chunk', h); return () => ipcRenderer.off('ai:chunk', h); },
     onStatus: (cb) => { const h = (_e, p) => cb(p); ipcRenderer.on('ai:status', h); return () => ipcRenderer.off('ai:status', h); },
     onDone: (cb) => { const h = (_e, p) => cb(p); ipcRenderer.on('ai:done', h); return () => ipcRenderer.off('ai:done', h); },
     onError: (cb) => { const h = (_e, p) => cb(p); ipcRenderer.on('ai:error', h); return () => ipcRenderer.off('ai:error', h); },
     cancel: () => ipcRenderer.send('ai:cancel'),
   });
   