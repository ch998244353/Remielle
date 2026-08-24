const { app, BrowserWindow, Menu, Tray, dialog, ipcMain, screen } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const {
  characterSizeForScale,
  clampPositionToWorkArea,
  dragPositionFromCursor,
  placeBubble,
  resizeAroundBottomCenter,
  restorePosition
} = require('./domain/window-geometry.js');
const {
  VALID_SCALES,
  loadPosition,
  normalizePreferences,
  savePosition
} = require('./position-store.js');
const {
  PIPE_NAME,
  inspectCodexHooks,
  installCodexHooks,
  resolveCodexHome,
  uninstallCodexHooks
} = require('./codex-hook.js');
const {
  createNotificationCoordinator,
  createPipeServer
} = require('./codex-notifications.js');
const { queryCodexRateLimit } = require('./codex-rate-limit.js');
const { runFirstRun } = require('./first-run.js');

const CHARACTER_READY_CHANNEL = 'character:ready';
const TEST_MESSAGE = '蕾米埃尔收到了一条测试消息。';
const BUBBLE_VISIBLE_MS = 6000;
const BUBBLE_SIZE = { width: 328, height: 160 };
const CHARACTER_SIZE = { width: 432, height: 300 };
const PIPE_PATH = `\\\\.\\pipe\\${PIPE_NAME}`;
const CHARACTER_WINDOW_OPTIONS = {
  width: 432,
  height: 300,
  frame: false,
  transparent: true,
  backgroundColor: '#00000000',
  resizable: false,
  useContentSize: true,
  alwaysOnTop: true,
  skipTaskbar: true,
  show: false,
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false
  }
};

let characterWindow = null;
let bubbleWindow = null;
let tray = null;
let quitting = false;
let dragSession = null;
let ipcRegistered = false;
let bubbleReady = false;
let bubbleText = null;
let bubbleTimer = null;
let characterReady = false;
let windowsHiddenByTray = false;
let positionFile = null;
let screenEventsRegistered = false;
let visualPreferences = normalizePreferences(null);
let interactionLocked = false;
let hookState = 'disabled';
let codexHome = null;
let userData = null;
let pipeServer = null;
let notificationCoordinator = null;
let rateLimitRequest = null;
let rateLimitAbortController = null;

function currentCharacterSize() {
  return characterSizeForScale(CHARACTER_SIZE, visualPreferences.scale);
}

function currentBubbleSize() {
  return characterSizeForScale(BUBBLE_SIZE, visualPreferences.bubbleScale);
}

function setScaledCharacterBounds(position, size, workArea, footAnchor) {
  characterWindow.setContentBounds({
    x: Math.round(position.x),
    y: Math.round(position.y),
    ...size
  });
  const actual = characterWindow.getContentBounds();
  const correction = {
    x: Math.round(footAnchor.x - (actual.x + actual.width / 2)),
    y: Math.round(footAnchor.y - (actual.y + actual.height))
  };
  if (correction.x === 0 && correction.y === 0) return;
  const corrected = clampPositionToWorkArea({
    x: position.x + correction.x,
    y: position.y + correction.y
  }, size, workArea);
  characterWindow.setContentBounds({
    x: Math.round(corrected.x),
    y: Math.round(corrected.y),
    ...size
  });
}

function sendCharacterSettings() {
  if (!characterWindow || characterWindow.isDestroyed()) return;
  characterWindow.webContents.send('character:appearance', {
    mirrored: visualPreferences.mirrored
  });
  characterWindow.webContents.send('character:interaction-locked', interactionLocked);
}

function validPoint(point) {
  return Number.isFinite(point?.x) && Number.isFinite(point?.y);
}

function registerIpc() {
  if (ipcRegistered) return;
  ipcRegistered = true;

  ipcMain.on('drag:start', (event, point) => {
    if (
      interactionLocked ||
      event.sender !== characterWindow?.webContents ||
      !validPoint(point)
    ) return;
    const bounds = characterWindow.getContentBounds();
    dragSession = {
      pointerX: point.x,
      pointerY: point.y,
      windowX: bounds.x,
      windowY: bounds.y,
      moved: false
    };
  });

  ipcMain.on('drag:move', (event) => {
    if (
      event.sender !== characterWindow?.webContents ||
      !dragSession
    ) return;

    const point = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint({
      x: Math.round(point.x),
      y: Math.round(point.y)
    });
    const position = dragPositionFromCursor(
      dragSession,
      point,
      currentCharacterSize(),
      display.workArea
    );
    dragSession.moved = true;
    const size = currentCharacterSize();
    characterWindow.setContentBounds({
      x: Math.round(position.x),
      y: Math.round(position.y),
      ...size
    });
    updateBubble();
  });

  ipcMain.on('drag:end', (event) => {
    if (event.sender !== characterWindow?.webContents) return;
    const moved = dragSession?.moved === true;
    dragSession = null;
    if (moved) persistCurrentPosition().catch(console.error);
  });

  ipcMain.on('bubble:show', (event, text) => {
    if (
      event.sender !== characterWindow?.webContents ||
      typeof text !== 'string' ||
      !text ||
      Array.from(text).length > 50
    ) return;
    showBubbleText(text);
  });

  ipcMain.on('bubble:hide', (event) => {
    if (event.sender !== characterWindow?.webContents) return;
    hideBubble();
  });

  ipcMain.handle('codex:rate-limit', (event) => {
    if (event.sender !== characterWindow?.webContents) {
      throw new Error('invalid rate limit requester');
    }
    return requestCodexRateLimit();
  });

  ipcMain.on('codex:notification-result', (event, result) => {
    if (event.sender !== characterWindow?.webContents) return;
    notificationCoordinator?.acknowledge(result);
  });

  ipcMain.on('character:idle', (event) => {
    if (event.sender !== characterWindow?.webContents) return;
    notificationCoordinator?.idle();
  });
}

function secureWindow(window, allowedFile) {
  const allowedUrl = pathToFileURL(allowedFile).href;
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== allowedUrl) event.preventDefault();
  });
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
}

function createCharacterWindow(position) {
  const page = path.join(__dirname, 'renderer', 'index.html');
  const size = currentCharacterSize();
  const window = new BrowserWindow({
    ...CHARACTER_WINDOW_OPTIONS,
    ...size,
    ...(position ? { x: position.x, y: position.y } : {})
  });
  characterWindow = window;
  characterReady = false;
  registerIpc();
  secureWindow(window, page);
  window.setAlwaysOnTop(true, 'normal');
  window.webContents.on('context-menu', () => {
    Menu.buildFromTemplate(buildPetTemplate()).popup({ window });
  });

  ipcMain.once(CHARACTER_READY_CHANNEL, () => {
    characterReady = true;
    sendCharacterSettings();
    window.setIgnoreMouseEvents(interactionLocked);
    notificationCoordinator?.idle();
    if (!window.isDestroyed() && !windowsHiddenByTray) window.showInactive();
  });

  window.loadFile(page);
  window.on('closed', () => {
    if (characterWindow === window) {
      characterWindow = null;
      characterReady = false;
      dragSession = null;
    }
  });
  return window;
}

function createBubbleWindow() {
  const size = currentBubbleSize();
  const page = path.join(__dirname, 'bubble', 'index.html');
  const window = new BrowserWindow({
    width: size.width,
    height: size.height,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    useContentSize: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'bubble-preload.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  bubbleWindow = window;
  bubbleReady = false;
  secureWindow(window, page);
  window.setAlwaysOnTop(true, 'normal');
  window.setIgnoreMouseEvents(true);
  window.webContents.once('did-finish-load', () => {
    bubbleReady = true;
    window.webContents.setZoomFactor(visualPreferences.bubbleScale);
    updateBubble();
  });
  window.loadFile(page);
  window.on('closed', () => {
    if (bubbleWindow === window) {
      bubbleWindow = null;
      bubbleReady = false;
    }
  });
  return window;
}

function clearBubbleTimer() {
  if (bubbleTimer !== null) clearTimeout(bubbleTimer);
  bubbleTimer = null;
}

function hideBubble() {
  clearBubbleTimer();
  bubbleText = null;
  bubbleWindow?.hide();
}

function showBubbleText(text) {
  if (
    typeof text !== 'string' ||
    !text ||
    Array.from(text).length > 50
  ) return false;
  bubbleText = text;
  clearBubbleTimer();
  bubbleTimer = setTimeout(() => {
    bubbleTimer = null;
    bubbleText = null;
    bubbleWindow?.hide();
  }, BUBBLE_VISIBLE_MS);
  updateBubble();
  return true;
}

function updateBubble() {
  if (
    !bubbleText ||
    !bubbleReady ||
    windowsHiddenByTray ||
    !characterWindow ||
    characterWindow.isDestroyed() ||
    !bubbleWindow ||
    bubbleWindow.isDestroyed()
  ) return;

  const characterBounds = characterWindow.getContentBounds();
  const workArea = screen.getDisplayMatching(characterBounds).workArea;
  const size = currentBubbleSize();
  const position = placeBubble(
    characterBounds,
    size,
    workArea,
    visualPreferences.bubbleSide,
    visualPreferences.mirrored
  );
  bubbleWindow.setContentBounds({
    x: Math.round(position.x),
    y: Math.round(position.y),
    ...size
  });
  bubbleWindow.webContents.send('bubble:update', {
    text: bubbleText,
    side: position.side
  });
  if (!bubbleWindow.isVisible()) bubbleWindow.showInactive();
}

function sendLocalMessage(text = TEST_MESSAGE) {
  if (characterWindow && !characterWindow.isDestroyed()) {
    characterWindow.webContents.send('message:local', text);
  }
}

async function requestCodexRateLimit() {
  if (!rateLimitRequest) {
    rateLimitAbortController = new AbortController();
    const pending = queryCodexRateLimit({ signal: rateLimitAbortController.signal });
    const tracked = pending.finally(() => {
      if (rateLimitRequest === tracked) {
        rateLimitRequest = null;
        rateLimitAbortController = null;
      }
    });
    rateLimitRequest = tracked;
  }

  let text;
  try {
    text = await rateLimitRequest;
  } catch {
    text = '暂时无法获取 Codex 剩余额度';
  }
  if (!quitting) showBubbleText(text);
  return text;
}

function toggleVisibility() {
  if (!characterReady) {
    windowsHiddenByTray = !windowsHiddenByTray;
    return;
  }

  if (!windowsHiddenByTray && characterWindow?.isVisible()) {
    windowsHiddenByTray = true;
    characterWindow.hide();
    bubbleWindow?.hide();
    return;
  }

  windowsHiddenByTray = false;
  ensureCharacterVisible();
  characterWindow?.showInactive();
  updateBubble();
}

function workAreas() {
  const primary = screen.getPrimaryDisplay();
  return [
    primary.workArea,
    ...screen.getAllDisplays()
      .filter((display) => display.id !== primary.id)
      .map((display) => display.workArea)
  ];
}

function ensureCharacterVisible() {
  if (!characterWindow || characterWindow.isDestroyed()) return null;
  const bounds = characterWindow.getContentBounds();
  const size = currentCharacterSize();
  const position = restorePosition(
    { version: 1, x: bounds.x, y: bounds.y },
    workAreas(),
    size
  );
  characterWindow.setContentBounds({ ...position, ...size });
  updateBubble();
  return position;
}

async function persistCurrentPosition() {
  if (!positionFile || !characterWindow || characterWindow.isDestroyed()) return;
  const bounds = characterWindow.getContentBounds();
  await savePosition(positionFile, { x: bounds.x, y: bounds.y, ...visualPreferences });
}

function resetPosition() {
  if (!characterWindow || characterWindow.isDestroyed()) return;
  const size = currentCharacterSize();
  const position = restorePosition(null, workAreas(), size);
  characterWindow.setContentBounds({ ...position, ...size });
  updateBubble();
  persistCurrentPosition().catch(console.error);
}

function showExistingInstance() {
  windowsHiddenByTray = false;
  ensureCharacterVisible();
  if (characterReady) characterWindow?.showInactive();
  updateBubble();
}

function refreshTrayMenu() {
  if (!tray || tray.isDestroyed()) return;
  tray.setContextMenu(Menu.buildFromTemplate(buildTrayTemplate()));
}

function setInteractionLocked(locked) {
  interactionLocked = locked === true;
  const moved = dragSession?.moved === true;
  dragSession = null;
  if (moved) persistCurrentPosition().catch(console.error);
  if (characterWindow && !characterWindow.isDestroyed()) {
    characterWindow.webContents.send('character:interaction-locked', interactionLocked);
    characterWindow.setIgnoreMouseEvents(interactionLocked);
  }
  refreshTrayMenu();
}

function toggleMirrored() {
  visualPreferences.mirrored = !visualPreferences.mirrored;
  sendCharacterSettings();
  refreshTrayMenu();
  persistCurrentPosition().catch(console.error);
}

function toggleBubbleSide() {
  visualPreferences.bubbleSide = visualPreferences.bubbleSide === 'right' ? 'left' : 'right';
  updateBubble();
  refreshTrayMenu();
  persistCurrentPosition().catch(console.error);
}

function changeScale(direction) {
  if (!characterWindow || characterWindow.isDestroyed()) return;
  const currentIndex = VALID_SCALES.indexOf(visualPreferences.scale);
  const nextIndex = currentIndex + direction;
  if (nextIndex < 0 || nextIndex >= VALID_SCALES.length) return;

  const bounds = characterWindow.getContentBounds();
  const workArea = screen.getDisplayMatching(bounds).workArea;
  const scale = VALID_SCALES[nextIndex];
  const size = characterSizeForScale(CHARACTER_SIZE, scale);
  const footAnchor = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height
  };
  const position = resizeAroundBottomCenter(bounds, size, workArea);
  visualPreferences.scale = scale;
  setScaledCharacterBounds(position, size, workArea, footAnchor);
  updateBubble();
  refreshTrayMenu();
  persistCurrentPosition().catch(console.error);
}

function changeBubbleScale(direction) {
  const currentIndex = VALID_SCALES.indexOf(visualPreferences.bubbleScale);
  const nextIndex = currentIndex + direction;
  if (nextIndex < 0 || nextIndex >= VALID_SCALES.length) return;
  visualPreferences.bubbleScale = VALID_SCALES[nextIndex];
  if (bubbleReady && bubbleWindow && !bubbleWindow.isDestroyed()) {
    bubbleWindow.webContents.setZoomFactor(visualPreferences.bubbleScale);
  }
  updateBubble();
  persistCurrentPosition().catch(console.error);
}

function hookStatusLabel() {
  return {
    disabled: '当前状态：未启用',
    enabled: '当前状态：配置已写入；请重启桌面端，并在 Codex CLI 输入 /hooks 审核并信任',
    needsRepair: '当前状态：需要修复',
    invalid: '当前状态：hooks.json 无效'
  }[hookState] || '当前状态：未知';
}

function buildPetTemplate() {
  const scaleIndex = VALID_SCALES.indexOf(visualPreferences.scale);
  const bubbleScaleIndex = VALID_SCALES.indexOf(visualPreferences.bubbleScale);
  return [
    {
      label: '停止交互',
      type: 'checkbox',
      checked: interactionLocked,
      click: (item) => setInteractionLocked(item.checked)
    },
    {
      label: '人物左右翻转',
      type: 'checkbox',
      checked: visualPreferences.mirrored,
      click: toggleMirrored
    },
    {
      label: `信息方向：${visualPreferences.bubbleSide === 'right' ? '右侧' : '左侧'}`,
      click: toggleBubbleSide
    },
    {
      label: '人物变大',
      enabled: scaleIndex < VALID_SCALES.length - 1,
      click: () => changeScale(1)
    },
    { label: '人物变小', enabled: scaleIndex > 0, click: () => changeScale(-1) },
    {
      label: '信息窗口变大',
      enabled: bubbleScaleIndex < VALID_SCALES.length - 1,
      click: () => changeBubbleScale(1)
    },
    {
      label: '信息窗口变小',
      enabled: bubbleScaleIndex > 0,
      click: () => changeBubbleScale(-1)
    },
    { type: 'separator' },
    { label: '模拟收到消息', click: () => sendLocalMessage() },
    { label: '回到屏幕内', click: resetPosition }
  ];
}

function buildTrayTemplate() {
  return [
    { label: '显示/隐藏', click: toggleVisibility },
    {
      label: '停止交互',
      type: 'checkbox',
      checked: interactionLocked,
      click: (item) => setInteractionLocked(item.checked)
    },
    {
      label: 'Codex 通知',
      submenu: [
        { label: '启用/修复', click: () => enableCodexNotifications().catch(console.error) },
        {
          label: '停用',
          enabled: hookState !== 'disabled',
          click: () => disableCodexNotifications().catch(console.error)
        },
        { type: 'separator' },
        { label: hookStatusLabel(), enabled: false }
      ]
    },
    { type: 'separator' },
    { label: '退出', click: quitApplication }
  ];
}

function createTray() {
  const appTray = new Tray(path.join(__dirname, '..', 'assets', 'processed', 'app.ico'));
  appTray.setToolTip('蕾米埃尔');
  appTray.setContextMenu(Menu.buildFromTemplate(buildTrayTemplate()));
  return appTray;
}

async function startPipeBridge() {
  if (pipeServer) return;
  if (!notificationCoordinator) {
    notificationCoordinator = createNotificationCoordinator({
      initiallyIdle: characterReady,
      send(notification) {
        if (characterWindow && !characterWindow.isDestroyed()) {
          characterWindow.webContents.send('codex:notification', notification);
        }
      }
    });
  }
  const server = createPipeServer(PIPE_PATH, (message) => {
    notificationCoordinator?.push(message);
  });
  await new Promise((resolve, reject) => {
    const onError = (error) => reject(error);
    server.once('error', onError);
    server.listen(PIPE_PATH, () => {
      server.removeListener('error', onError);
      server.on('error', console.error);
      resolve();
    });
  });
  pipeServer = server;
}

async function stopPipeBridge() {
  if (!pipeServer) return;
  const server = pipeServer;
  pipeServer = null;
  await new Promise((resolve) => server.close(resolve));
}

async function enableCodexNotifications() {
  try {
    await installCodexHooks({ codexHome, userData, pipeName: PIPE_NAME });
    await startPipeBridge();
    hookState = 'enabled';
    refreshTrayMenu();
    sendLocalMessage('请完全退出并重新打开 Codex 桌面应用，再到 CLI 输入 /hooks 信任。');
  } catch (error) {
    hookState = error.name === 'HookConfigError' ? 'invalid' : 'needsRepair';
    refreshTrayMenu();
    sendLocalMessage(`Codex 通知配置失败：${error.message}`);
    throw error;
  }
}

async function disableCodexNotifications() {
  try {
    await uninstallCodexHooks({ codexHome, userData });
    await stopPipeBridge();
    hookState = 'disabled';
    refreshTrayMenu();
    sendLocalMessage('Codex 通知已停用，其他 Hook 保持不变。');
  } catch (error) {
    hookState = error.name === 'HookConfigError' ? 'invalid' : 'needsRepair';
    refreshTrayMenu();
    sendLocalMessage(`无法停用 Codex 通知：${error.message}`);
    throw error;
  }
}

async function refreshHookState() {
  const status = await inspectCodexHooks({ codexHome, userData, pipeName: PIPE_NAME });
  hookState = status.state;
  if (hookState === 'enabled' || hookState === 'needsRepair') await startPipeBridge();
  refreshTrayMenu();
  return status;
}

async function showFirstRunOnboarding(savedPosition) {
  return runFirstRun({
    savedPosition,
    choose: async () => {
      const result = await dialog.showMessageBox({
        type: 'question',
        title: '欢迎使用蕾米埃尔',
        message: '是否启用 Codex 桌面任务通知？',
        detail: '启用后，蕾米埃尔会显示经过清洗的任务、工具与结束摘要。你也可以稍后从托盘启用。',
        buttons: ['一键启用 Codex 通知', '暂不启用'],
        defaultId: 0,
        cancelId: 1,
        noLink: true
      });
      return result.response === 0;
    },
    enableNotifications: enableCodexNotifications,
    persistPosition: persistCurrentPosition,
    showResult: ({ enabled, error }) => dialog.showMessageBox({
      type: enabled ? 'info' : 'error',
      title: enabled ? 'Codex 通知配置已写入' : 'Codex 通知启用失败',
      message: enabled
        ? '请完全退出并重新打开 Codex 桌面应用。'
        : '暂时无法启用 Codex 通知，你可以稍后从托盘重试。',
      detail: enabled
        ? '重启后，请在 Codex CLI 输入 /hooks，审核并信任“蕾米埃尔桌宠通知”。'
        : String(error?.message || '未知错误'),
      buttons: ['知道了'],
      noLink: true
    })
  });
}

function quitApplication() {
  quitting = true;
  rateLimitAbortController?.abort();
  rateLimitAbortController = null;
  hideBubble();
  notificationCoordinator?.dispose();
  notificationCoordinator = null;
  pipeServer?.close();
  pipeServer = null;
  characterWindow?.destroy();
  bubbleWindow?.destroy();
  tray?.destroy();
  app.quit();
}

async function bootstrap() {
  await app.whenReady();
  userData = app.getPath('userData');
  codexHome = resolveCodexHome();
  positionFile = path.join(userData, 'position.json');
  const savedPosition = await loadPosition(positionFile);
  visualPreferences = normalizePreferences(savedPosition);
  const initialPosition = restorePosition(
    savedPosition,
    workAreas(),
    currentCharacterSize()
  );
  characterWindow = createCharacterWindow(initialPosition);
  bubbleWindow = createBubbleWindow();
  tray = createTray();
  await refreshHookState().catch((error) => {
    hookState = 'needsRepair';
    refreshTrayMenu();
    console.error(error);
  });
  await showFirstRunOnboarding(savedPosition);

  if (!screenEventsRegistered) {
    screenEventsRegistered = true;
    screen.on('display-removed', () => {
      ensureCharacterVisible();
      persistCurrentPosition().catch(console.error);
    });
    screen.on('display-metrics-changed', () => {
      ensureCharacterVisible();
      persistCurrentPosition().catch(console.error);
    });
  }

  app.on('activate', () => {
    if (!characterWindow) {
      const position = restorePosition(null, workAreas(), currentCharacterSize());
      characterWindow = createCharacterWindow(position);
    }
    if (!bubbleWindow) bubbleWindow = createBubbleWindow();
  });
  app.on('window-all-closed', () => {
    if (quitting) app.quit();
  });
  return { bubbleWindow, characterWindow, positionFile, tray };
}

async function startPrimaryInstance() {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return null;
  }
  app.on('second-instance', showExistingInstance);
  return bootstrap();
}

const launchedAsApplication = !process.defaultApp || (
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(process.cwd())
);

if (launchedAsApplication) {
  startPrimaryInstance().catch((error) => {
    console.error(error);
    app.exit(1);
  });
}

module.exports = {
  CHARACTER_WINDOW_OPTIONS,
  TEST_MESSAGE,
  bootstrap,
  buildTrayTemplate,
  changeScale,
  createBubbleWindow,
  createCharacterWindow,
  createTray,
  sendLocalMessage,
  startPrimaryInstance
};
