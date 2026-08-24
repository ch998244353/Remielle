const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

test('人物绑定六种运行媒体，拖动保持帧和额度 IPC 保持窄边界', async () => {
  const root = path.join(__dirname, '..');
  const [html, css, preload, renderer] = await Promise.all([
    fs.readFile(path.join(root, 'src', 'renderer', 'index.html'), 'utf8'),
    fs.readFile(path.join(root, 'src', 'renderer', 'style.css'), 'utf8'),
    fs.readFile(path.join(root, 'src', 'preload.js'), 'utf8'),
    fs.readFile(path.join(root, 'src', 'renderer', 'renderer.js'), 'utf8')
  ]);
  const mediaIds = [...html.matchAll(/<(?:video|img) id="([^"]+)"/gu)]
    .map((match) => match[1]);
  assert.deepEqual(mediaIds, [
    'idle',
    'click',
    'message',
    'dragPickup',
    'dragHold',
    'dragRelease'
  ]);
  assert.ok(html.indexOf('media-controller.js') < html.indexOf('renderer.js'));
  assert.match(css, /body\[data-mirrored="true"\] video/u);
  assert.match(css, /body\[data-mirrored="true"\] img/u);
  assert.doesNotMatch(preload, /hooks\.json|powershell|child_process|auth/iu);
  assert.match(preload, /codex:notification-result/u);
  assert.match(preload, /requestBalance/u);
  assert.match(preload, /invoke\('balance:read'\)/u);
  assert.match(preload, /character:idle/u);
  assert.doesNotMatch(preload, /completeDrag/u);
  assert.match(renderer, /dragPickup|dragHold|dragRelease/u);
  assert.match(renderer, /after\.dragging/u);
  assert.match(renderer, /result\.animate/u);
  assert.match(renderer, /requestBalance/u);
});

test('Codex 通知启用提示区分配置已写入与桌面任务已加载', async () => {
  const main = await fs.readFile(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');

  assert.match(main, /完全退出并重新打开 Codex 桌面应用/u);
  assert.match(main, /Codex CLI.*\/hooks.*审核并信任/u);
  assert.doesNotMatch(main, /请在 Codex \/hooks 中审核并信任/u);
});

test('托盘仅保留安全入口，桌宠右键承载外观和位置操作', async () => {
  const main = await fs.readFile(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const tray = main.match(/function buildTrayTemplate\(\) \{[\s\S]*?^\}/mu)?.[0] || '';
  const pet = main.match(/function buildPetTemplate\(\) \{[\s\S]*?^\}/mu)?.[0] || '';

  for (const label of ['显示/隐藏', '停止交互', 'Codex 通知', 'DeepSeek Harness', '退出']) {
    assert.match(tray, new RegExp(label, 'u'));
  }
  assert.doesNotMatch(tray, /人物左右翻转|信息方向|模拟收到消息|回到屏幕内|人物变大/u);

  for (const label of [
    '停止交互',
    '人物左右翻转',
    '信息方向',
    '人物变大',
    '人物变小',
    '信息窗口变大',
    '信息窗口变小',
    '余额来源',
    '消息监控',
    'Codex 消息',
    'DeepSeek 消息',
    'Codex',
    'DeepSeek',
    '模拟收到消息',
    '回到屏幕内'
  ]) assert.match(pet, new RegExp(label, 'u'));
  assert.doesNotMatch(pet, /显示\/隐藏|Codex 通知|退出/u);
  assert.match(main, /BUBBLE_VISIBLE_MS = 6000/u);
});

test('消息气泡使用高于普通置顶窗口的最上层级且保持鼠标穿透', async () => {
  const main = await fs.readFile(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const bubbleWindow = main.match(/function createBubbleWindow\(\) \{[\s\S]*?^\}/mu)?.[0] || '';

  assert.match(bubbleWindow, /setAlwaysOnTop\(true, 'screen-saver'\)/u);
  assert.match(bubbleWindow, /setIgnoreMouseEvents\(true\)/u);
});

test('项目通知使用 16:9 气泡、固定项目标题和滚轮分页，纯文本消息仍穿透', async () => {
  const root = path.join(__dirname, '..');
  const [main, petPreload, petRenderer, html, css, bubblePreload, bubbleRenderer] = await Promise.all([
    fs.readFile(path.join(root, 'src', 'main.js'), 'utf8'),
    fs.readFile(path.join(root, 'src', 'preload.js'), 'utf8'),
    fs.readFile(path.join(root, 'src', 'renderer', 'renderer.js'), 'utf8'),
    fs.readFile(path.join(root, 'src', 'bubble', 'index.html'), 'utf8'),
    fs.readFile(path.join(root, 'src', 'bubble', 'style.css'), 'utf8'),
    fs.readFile(path.join(root, 'src', 'bubble-preload.js'), 'utf8'),
    fs.readFile(path.join(root, 'src', 'bubble', 'renderer.js'), 'utf8')
  ]);

  assert.match(main, /BUBBLE_SIZE = \{ width: 336, height: 184 \}/u);
  assert.match(css, /width:\s*320px/u);
  assert.match(css, /height:\s*180px/u);
  assert.match(html, /id="source-name"/u);
  assert.match(html, /id="project-name"/u);
  assert.match(html, /id="source-name"[\s\S]*?·[\s\S]*?id="project-name"/u);
  assert.match(html, /id="message-detail"/u);
  assert.match(css, /#b02f61/iu);
  assert.match(css, /white-space:\s*nowrap/u);
  assert.match(css, /overflow-y:\s*auto/u);
  assert.match(petPreload, /mode === 'project'/u);
  assert.match(petRenderer, /notification\.projectName/u);
  assert.match(bubblePreload, /bubble:page-change/u);
  assert.match(bubbleRenderer, /addEventListener\('wheel'/u);
  assert.match(bubbleRenderer, /clientHeight/u);
  assert.match(bubbleRenderer, /reportPageChange/u);
  assert.match(main, /bubble:page-change/u);
  assert.match(main, /ipcMain\.on\('bubble:page-change'[\s\S]*?armBubbleTimer\(\);/u);
  assert.match(main, /setIgnoreMouseEvents\(content\.mode !== 'project'\)/u);
});
