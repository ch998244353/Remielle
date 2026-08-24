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
  requestBalance: () => ipcRenderer.invoke('balance:read'),
  showBubble: (content) => {
    if (typeof content === 'string') {
      ipcRenderer.send('bubble:show', content);
    } else if (
      content?.mode === 'project' &&
      ['codex', 'deepseek'].includes(content.source) &&
      typeof content.projectName === 'string' &&
      content.projectName.length <= 80 &&
      typeof content.detail === 'string' &&
      content.detail.length <= 1024
    ) {
      ipcRenderer.send('bubble:show', {
        mode: 'project',
        source: content.source,
        projectName: content.projectName,
        detail: content.detail
      });
    }
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
    const listener = (_event, notification) => {
      if (
        typeof notification?.id === 'string' &&
        typeof notification.text === 'string' &&
        ['codex', 'deepseek'].includes(notification.source) &&
        typeof notification.projectName === 'string' &&
        notification.projectName.length <= 80 &&
        typeof notification.detail === 'string' &&
        notification.detail.length <= 1024
      ) callback(notification);
    };
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
