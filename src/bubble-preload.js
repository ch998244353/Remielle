const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bubbleApi', {
  onUpdate: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => {
      if (
        typeof payload?.text === 'string' &&
        (payload.side === 'left' || payload.side === 'right')
      ) callback(payload);
    };
    ipcRenderer.on('bubble:update', listener);
    return () => ipcRenderer.removeListener('bubble:update', listener);
  }
});
