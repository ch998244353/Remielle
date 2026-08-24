const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { runFirstRun } = require('../src/first-run.js');
const { inspectCodexHooks, installCodexHooks } = require('../src/codex-hook.js');
const { loadPosition, savePosition } = require('../src/position-store.js');

async function temporaryPaths(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'remiel-first-run-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const codexHome = path.join(root, 'codex-home');
  const userData = path.join(root, 'user-data');
  const positionFile = path.join(userData, 'position.json');
  await fs.mkdir(codexHome, { recursive: true });
  return { codexHome, positionFile, userData };
}

test('首次运行启用通知后写入 Hook 与位置，并给出成功结果', async (t) => {
  const paths = await temporaryPaths(t);
  const results = [];
  const outcome = await runFirstRun({
    savedPosition: await loadPosition(paths.positionFile),
    choose: async () => true,
    enableNotifications: () => installCodexHooks(paths),
    persistPosition: () => savePosition(paths.positionFile, { x: 100, y: 200 }),
    showResult: async (result) => results.push(result)
  });

  assert.equal(outcome.shown, true);
  assert.equal(outcome.enabled, true);
  assert.equal((await inspectCodexHooks(paths)).state, 'enabled');
  assert.deepEqual(await loadPosition(paths.positionFile), {
    version: 1,
    x: 100,
    y: 200,
    scale: 1,
    bubbleScale: 1,
    mirrored: false,
    bubbleSide: 'right',
    balanceSource: 'codex',
    monitorCodex: true,
    monitorDeepSeek: true
  });
  assert.deepEqual(results, [{ enabled: true, error: null }]);
});

test('暂不启用和启用失败都完成首次位置保存，已有配置不再弹窗', async (t) => {
  const skipped = await temporaryPaths(t);
  let prompted = 0;
  const skippedOutcome = await runFirstRun({
    savedPosition: null,
    choose: async () => { prompted += 1; return false; },
    enableNotifications: async () => assert.fail('不应启用'),
    persistPosition: () => savePosition(skipped.positionFile, { x: 1, y: 2 }),
    showResult: async () => assert.fail('不应显示启用结果')
  });
  assert.deepEqual(skippedOutcome, { shown: true, enabled: false, error: null });
  assert.ok(await loadPosition(skipped.positionFile));

  const failure = new Error('模拟安装失败');
  const results = [];
  const failedOutcome = await runFirstRun({
    savedPosition: null,
    choose: async () => true,
    enableNotifications: async () => { throw failure; },
    persistPosition: () => savePosition(skipped.positionFile, { x: 3, y: 4 }),
    showResult: async (result) => results.push(result)
  });
  assert.equal(failedOutcome.error, failure);
  assert.deepEqual(results, [{ enabled: false, error: failure }]);

  const existing = await loadPosition(skipped.positionFile);
  const existingOutcome = await runFirstRun({
    savedPosition: existing,
    choose: async () => { prompted += 1; return true; },
    enableNotifications: async () => assert.fail('已有配置不应启用'),
    persistPosition: async () => assert.fail('已有配置不应覆盖'),
    showResult: async () => assert.fail('已有配置不应提示')
  });
  assert.deepEqual(existingOutcome, { shown: false, enabled: false });
  assert.equal(prompted, 1);
});
