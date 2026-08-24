const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bubbleApi', {
  onUpdate: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => {
      if (
        (payload?.side === 'left' || payload?.side === 'right') &&
        (
          (payload.mode === 'plain' && typeof payload.text === 'string' && payload.text.length <= 50) ||
          (
            payload.mode === 'project' &&
            ['codex', 'deepseek'].includes(payload.source) &&
            typeof payload.projectName === 'string' &&
            payload.projectName.length <= 80 &&
            typeof payload.detail === 'string' &&
            payload.detail.length <= 1024
          )
        )
      ) callback(payload);
    };
    ipcRenderer.on('bubble:update', listener);
    return () => ipcRenderer.removeListener('bubble:update', listener);
  },
  reportPageChange: () => ipcRenderer.send('bubble:page-change')
});
