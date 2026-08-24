const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { randomUUID } = require('node:crypto');
const {
  DEEPSEEK_BALANCE_PIPE_PATH,
  DSH_PACKAGE,
  DSH_VERSION,
  buildDshPluginCommand,
  inspectDeepSeekPlugin,
  queryDeepSeekBalance,
  runDshPluginCommand,
  stageDeepSeekBundle
} = require('../src/deepseek-harness.js');

const bundleUrl = pathToFileURL(path.join(
  __dirname,
  '..',
  'src',
  'integrations',
  'deepseek-harness',
  'index.js'
)).href;

function sessionEvent(type, data) {
  return { type, seq: 1, time: 1, data };
}

test('Bundle 暂存、固定 rc.2 CLI 参数和 web profile 状态保持窄边界', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'remiel-dsh-install-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const userData = path.join(directory, 'user-data');
  const dshHome = path.join(directory, 'dsh-home');
  const staged = await stageDeepSeekBundle({ userData });
  assert.deepEqual((await fs.readdir(staged)).sort(), [
    'cordis.patch.yml',
    'index.js',
    'package.json'
  ]);

  assert.deepEqual(buildDshPluginCommand('add', staged).args, [
    '--yes', `${DSH_PACKAGE}@${DSH_VERSION}`,
    'plugin', '--profile', 'web', 'add', staged
  ]);
  assert.deepEqual(buildDshPluginCommand('remove').args, [
    '--yes', `${DSH_PACKAGE}@${DSH_VERSION}`,
    'plugin', '--profile', 'web', 'remove', 'remiel-dsh-bridge'
  ]);
  assert.equal((await inspectDeepSeekPlugin({ dshHome })).state, 'disabled');

  const profile = path.join(dshHome, 'profiles', 'web');
  const other = path.join(dshHome, 'profiles', 'other', 'package.json');
  await fs.mkdir(path.dirname(other), { recursive: true });
  await fs.writeFile(other, '{"keep":true}\n', 'utf8');
  await fs.mkdir(profile, { recursive: true });
  await fs.writeFile(path.join(profile, 'package.json'), JSON.stringify({
    dependencies: { 'remiel-dsh-bridge': `link:${staged}` },
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'remiel-dsh-bridge'] } }
  }), 'utf8');
  assert.equal((await inspectDeepSeekPlugin({ dshHome })).state, 'enabled');
  assert.equal(await fs.readFile(other, 'utf8'), '{"keep":true}\n');

  const calls = [];
  await runDshPluginCommand({
    action: 'remove',
    dshHome,
    spawnProcess(command, args, options) {
      calls.push({ command, args, options });
      const child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.kill = () => {};
      process.nextTick(() => child.emit('close', 0));
      return child;
    }
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, buildDshPluginCommand('remove').args);
  assert.equal(calls[0].options.env.DSH_HOME, dshHome);
});

test('DeepSeek 事件只映射真实用户、工具安全摘要、审批和结束原因', async () => {
  const { createEventBridge } = await import(bundleUrl);
  const sent = [];
  const bridge = createEventBridge((message) => sent.push(message));
  const session = {
    id: 'session-1',
    header: { cwd: 'C:\\Users\\ch\\Desktop\\桌宠创作' }
  };

  bridge(session, sessionEvent('user/message', {
    source: { kind: 'plugin', plugin: 'fixture' },
    content: [{ type: 'text', text: '不能触发' }]
  }));
  assert.equal(sent.length, 0);

  bridge(session, sessionEvent('user/message', {
    source: { kind: 'user' },
    content: [{ type: 'text', text: '请修复通知桥并且不要泄漏后续完整提示词' }]
  }));
  bridge(session, sessionEvent('tool/call', {
    turn: 1,
    name: 'Bash',
    arguments: JSON.stringify({
      command: 'npm test -- --token sk-secret\nset API_KEY=another-secret'
    })
  }));
  bridge(session, sessionEvent('tool/call', {
    turn: 1,
    name: 'apply_patch',
    arguments: JSON.stringify({ path: 'C:\\Users\\private\\package.json', patch: 'secret output' })
  }));
  bridge(session, sessionEvent('approval/asked', {
    toolName: 'Bash',
    reason: 'approve sk-secret at C:\\Users\\private'
  }));
  bridge(session, sessionEvent('assistant/message', {
    turn: 1,
    message: {
      content: [{ type: 'text', text: `${'完成摘要'.repeat(20)} sk-secret` }]
    }
  }));
  bridge(session, sessionEvent('turn/end', { turn: 1, reason: { kind: 'completed' } }));

  assert.deepEqual(sent.map((message) => message.event), [
    'UserPromptSubmit', 'PreToolUse', 'PreToolUse', 'PermissionRequest', 'Stop'
  ]);
  assert.equal(sent[1].detailText, '正在运行 npm test');
  assert.equal(sent[1].projectName, '桌宠创作');
  assert.equal(sent[1].commandText, 'npm test -- --token ***\nset API_KEY=***');
  assert.equal(sent[2].detailText, '正在修改 package.json');
  assert.equal(sent[3].detailText, '等待确认：运行命令');
  const serialized = JSON.stringify(sent);
  for (const secret of ['sk-secret', 'C:\\\\Users\\\\private', 'secret output']) {
    assert.doesNotMatch(serialized, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  }
  assert.ok(Array.from(sent.at(-1).finalText).length <= 40);

  for (const [kind, text] of [
    ['error', '任务失败'],
    ['aborted', '任务已取消'],
    ['blocked', '任务被阻止'],
    ['max-tokens', '达到输出上限'],
    ['interrupted', '任务被中断']
  ]) {
    bridge(session, sessionEvent('turn/end', { turn: 2, reason: { kind } }));
    assert.equal(sent.at(-1).detailText, text);
  }
});

test('余额请求只临时解析 Key，格式化多币种并收敛为固定错误码', async () => {
  const { readDeepSeekBalance } = await import(bundleUrl);
  const credentials = { resolve: async () => ({ value: 'temporary-key', source: 'file' }) };
  const success = await readDeepSeekBalance({
    credentials,
    fetchImpl: async (_url, options) => {
      assert.equal(options.headers.Authorization, 'Bearer temporary-key');
      return {
        ok: true,
        json: async () => ({
          is_available: true,
          balance_infos: [
            { currency: 'CNY', total_balance: '110.00' },
            { currency: 'USD', total_balance: '15.00' }
          ]
        })
      };
    }
  });
  assert.deepEqual(success, { ok: true, text: 'DeepSeek 余额：CNY 110.00，USD 15.00' });

  assert.deepEqual(await readDeepSeekBalance({
    credentials: { resolve: async () => undefined },
    fetchImpl: () => assert.fail('no request without key')
  }), { ok: false, code: 'not_configured' });
  assert.deepEqual(await readDeepSeekBalance({
    credentials,
    fetchImpl: async () => ({ ok: false, status: 401 })
  }), { ok: false, code: 'request_failed' });
  assert.deepEqual(await readDeepSeekBalance({
    credentials,
    fetchImpl: async () => ({ ok: true, json: async () => ({ is_available: false, balance_infos: [] }) })
  }), { ok: true, text: 'DeepSeek 余额不可用' });
  assert.deepEqual(await readDeepSeekBalance({
    credentials,
    fetchImpl: async () => ({ ok: true, json: async () => ({ is_available: true, balance_infos: [] }) })
  }), { ok: false, code: 'invalid_response' });
  assert.deepEqual(await readDeepSeekBalance({
    credentials,
    timeoutMs: 10,
    fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    })
  }), { ok: false, code: 'request_failed' });
});

test('余额 Pipe 支持并发复用、无 Key 固定错误且关闭后不残留', {
  skip: process.platform !== 'win32'
}, async (t) => {
  const { createBalanceServer } = await import(bundleUrl);
  const pipePath = `${DEEPSEEK_BALANCE_PIPE_PATH}-${randomUUID()}`;
  const server = createBalanceServer({
    pipePath,
    credentials: { resolve: async () => undefined }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(pipePath, resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const results = await Promise.all([
    queryDeepSeekBalance({ pipePath }),
    queryDeepSeekBalance({ pipePath })
  ]);
  assert.deepEqual(results, [
    { ok: false, code: 'not_configured' },
    { ok: false, code: 'not_configured' }
  ]);
  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(
    queryDeepSeekBalance({ pipePath, signal: cancelled.signal }),
    (error) => error.code === 'cancelled'
  );

  await new Promise((resolve) => server.close(resolve));
  assert.equal(server.listening, false);

  const unsupportedPipe = `${DEEPSEEK_BALANCE_PIPE_PATH}-${randomUUID()}`;
  const unsupported = createBalanceServer({
    pipePath: unsupportedPipe,
    credentials: { resolve: async () => assert.fail('unsupported version must not resolve key') },
    fixedResult: { ok: false, code: 'unsupported_version' }
  });
  await new Promise((resolve, reject) => {
    unsupported.once('error', reject);
    unsupported.listen(unsupportedPipe, resolve);
  });
  assert.deepEqual(await queryDeepSeekBalance({ pipePath: unsupportedPipe }), {
    ok: false,
    code: 'unsupported_version'
  });
  await new Promise((resolve) => unsupported.close(resolve));
});
