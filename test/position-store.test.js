const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  loadPosition,
  normalizePreferences,
  savePosition
} = require('../src/position-store.js');

test('位置配置容忍缺失和损坏，并以同目录临时文件原子替换', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'remiel-position-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'position.json');

  assert.equal(await loadPosition(file), null);
  await fs.writeFile(file, '{坏 JSON', 'utf8');
  assert.equal(await loadPosition(file), null);

  await savePosition(file, { x: 120, y: -45 });
  assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), {
    version: 1,
    x: 120,
    y: -45,
    scale: 1,
    bubbleScale: 1,
    mirrored: false,
    bubbleSide: 'right',
    balanceSource: 'codex',
    monitorCodex: true,
    monitorDeepSeek: true
  });
  await savePosition(file, {
    x: 320,
    y: 640,
    scale: 1.5,
    bubbleScale: 0.75,
    mirrored: true,
    bubbleSide: 'left',
    balanceSource: 'deepseek',
    monitorCodex: false,
    monitorDeepSeek: true
  });
  assert.deepEqual(await loadPosition(file), {
    version: 1,
    x: 320,
    y: 640,
    scale: 1.5,
    bubbleScale: 0.75,
    mirrored: true,
    bubbleSide: 'left',
    balanceSource: 'deepseek',
    monitorCodex: false,
    monitorDeepSeek: true
  });
  assert.deepEqual(await fs.readdir(directory), ['position.json']);
});

test('旧配置与损坏偏好分别回退，合法视觉偏好保持', () => {
  assert.deepEqual(normalizePreferences({ version: 1, x: 10, y: 20 }), {
    scale: 1,
    bubbleScale: 1,
    mirrored: false,
    bubbleSide: 'right',
    balanceSource: 'codex',
    monitorCodex: true,
    monitorDeepSeek: true
  });
  assert.deepEqual(normalizePreferences({
    scale: 0.6,
    bubbleScale: 2,
    mirrored: 'true',
    bubbleSide: 'up',
    balanceSource: 'other',
    monitorCodex: 'yes',
    monitorDeepSeek: 0
  }), {
    scale: 1,
    bubbleScale: 1,
    mirrored: false,
    bubbleSide: 'right',
    balanceSource: 'codex',
    monitorCodex: true,
    monitorDeepSeek: true
  });
  assert.deepEqual(normalizePreferences({
    scale: 0.5,
    bubbleScale: 1.25,
    mirrored: true,
    bubbleSide: 'left',
    balanceSource: 'deepseek',
    monitorCodex: false,
    monitorDeepSeek: false
  }), {
    scale: 0.5,
    bubbleScale: 1.25,
    mirrored: true,
    bubbleSide: 'left',
    balanceSource: 'deepseek',
    monitorCodex: false,
    monitorDeepSeek: false
  });
});

test('连续偏好变更串行原子保存，最后一次写入生效且不残留临时文件', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'remiel-position-burst-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'position.json');
  await Promise.all([
    savePosition(file, { x: 10, y: 20, scale: 0.5, bubbleScale: 1.5 }),
    savePosition(file, { x: 30, y: 40, scale: 1, bubbleScale: 1.25 }),
    savePosition(file, {
      x: 50,
      y: 60,
      scale: 1.5,
      bubbleScale: 0.5,
      mirrored: true,
      bubbleSide: 'left',
      balanceSource: 'deepseek',
      monitorCodex: true,
      monitorDeepSeek: false
    })
  ]);
  assert.deepEqual(await loadPosition(file), {
    version: 1,
    x: 50,
    y: 60,
    scale: 1.5,
    bubbleScale: 0.5,
    mirrored: true,
    bubbleSide: 'left',
    balanceSource: 'deepseek',
    monitorCodex: true,
    monitorDeepSeek: false
  });
  assert.deepEqual(await fs.readdir(directory), ['position.json']);
});
