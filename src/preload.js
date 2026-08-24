const { contextBridge, ipcRenderer } = require('electron');

function sendPoint(channel, x, y) {
  if (Number.isFinite(x) && Number.isFinite(y)) {
    ipcRenderer.send(channel, { x, y });
  }
}

contextBridge.exposeInMainWorld('petApi', {
  startDrag: (x, y) => sendPoint('drag:start', x, y),
  moveDrag: () => ipcRenderer.send('drag:move'),
  endDrag: () => ipcRenderer.send('drag:end'),
  requestCodexRateLimit: () => ipcRenderer.invoke('codex:rate-limit'),
  showBubble: (text) => {
    if (typeof text === 'string') ipcRenderer.send('bubble:show', text);
  },
  hideBubble: () => ipcRenderer.send('bubble:hide'),
  reportNotification: (id, status) => {
    if (
      typeof id === 'string' &&
      id.length <= 64 &&
      ['accepted', 'busy', 'empty'].includes(status)
    ) {
      ipcRenderer.send('codex:notification-result', { id, status });
    }
  },
  notifyIdle: () => ipcRenderer.send('character:idle'),
  onNotification: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, notification) => callback(notification);
    ipcRenderer.on('codex:notification', listener);
    return () => ipcRenderer.removeListener('codex:notification', listener);
  },
  onAppearance: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, appearance) => callback(appearance);
    ipcRenderer.on('character:appearance', listener);
    return () => ipcRenderer.removeListener('character:appearance', listener);
  },
  onInteractionLocked: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, locked) => callback(locked === true);
    ipcRenderer.on('character:interaction-locked', listener);
    return () => ipcRenderer.removeListener('character:interaction-locked', listener);
  },
  onMessage: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, text) => callback(text);
    ipcRenderer.on('message:local', listener);
    return () => ipcRenderer.removeListener('message:local', listener);
  }
});

window.addEventListener('DOMContentLoaded', () => {
  const idle = document.getElementById('idle');
  const notifyReady = () => ipcRenderer.send('character:ready');

  if (idle.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
    notifyReady();
  } else {
    idle.addEventListener('canplay', notifyReady, { once: true });
  }
});
