const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const path = require('node:path');
const { queryCodexRateLimit, resolveCodexCommand } = require('../src/codex-rate-limit.js');

function createChild(onRequest = () => {}) {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.killed = false;
  child.kill = () => {
    child.killed = true;
    return true;
  };

  let buffered = '';
  child.stdin.on('data', (chunk) => {
    buffered += chunk.toString('utf8');
    let newline;
    while ((newline = buffered.indexOf('\n')) !== -1) {
      const line = buffered.slice(0, newline);
      buffered = buffered.slice(newline + 1);
      if (line) onRequest(JSON.parse(line), child);
    }
  });
  return child;
}

test('通过 App Server 标准握手读取主额度并格式化剩余百分比', async () => {
  const requests = [];
  const child = createChild((request, server) => {
    requests.push(request);
    if (request.method === 'initialize') {
      server.stdout.write(`${JSON.stringify({ id: 0, result: {} })}\n`);
    }
    if (request.method === 'account/rateLimits/read') {
      server.stdout.write(`${JSON.stringify({ method: 'account/rateLimits/updated', params: {} })}\n`);
      server.stdout.write(`${JSON.stringify({
        id: 1,
        result: {
          rateLimits: {
            primary: { usedPercent: 24, resetsAt: 1788065617 }
          }
        }
      })}\n`);
    }
  });
  const spawnCalls = [];

  const text = await queryCodexRateLimit({
    command: 'codex.exe',
    spawnProcess(command, args, options) {
      spawnCalls.push({ command, args, options });
      return child;
    },
    timeZone: 'Asia/Shanghai'
  });

  assert.equal(text, 'Codex 剩余 76%，8月30日 12:53 重置');
  assert.deepEqual(requests.map(({ method }) => method), [
    'initialize',
    'initialized',
    'account/rateLimits/read'
  ]);
  assert.deepEqual(spawnCalls, [{
    command: 'codex.exe',
    args: ['app-server'],
    options: { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] }
  }]);
  assert.equal(child.killed, true);
});

test('拒绝缺失或非数值的额度响应并结束子进程', async () => {
  const child = createChild((request, server) => {
    if (request.method === 'initialize') {
      server.stdout.write(`${JSON.stringify({ id: 0, result: {} })}\n`);
    }
    if (request.method === 'account/rateLimits/read') {
      server.stdout.write(`${JSON.stringify({
        id: 1,
        result: { rateLimits: { primary: { usedPercent: '24', resetsAt: null } } }
      })}\n`);
    }
  });

  await assert.rejects(
    queryCodexRateLimit({ command: 'codex.exe', spawnProcess: () => child }),
    /invalid rate limit response/u
  );
  assert.equal(child.killed, true);
});

test('额度请求超时或被取消时结束子进程', async () => {
  const timedOutChild = createChild();
  await assert.rejects(
    queryCodexRateLimit({ command: 'codex.exe', spawnProcess: () => timedOutChild, timeoutMs: 5 }),
    /timed out/u
  );
  assert.equal(timedOutChild.killed, true);

  const cancelledChild = createChild();
  const controller = new AbortController();
  const pending = queryCodexRateLimit({
    command: 'codex.exe',
    spawnProcess: () => cancelledChild,
    signal: controller.signal
  });
  controller.abort();
  await assert.rejects(pending, /aborted/u);
  assert.equal(cancelledChild.killed, true);
});

test('Windows 安装版从 Appx 安装位置解析 Codex 可执行文件', () => {
  const installLocation = 'C:\\Program Files\\WindowsApps\\OpenAI.Codex_test';
  const executable = path.join(installLocation, 'app', 'resources', 'codex.exe');

  assert.equal(resolveCodexCommand({
    platform: 'win32',
    findAppxInstallLocation: () => installLocation,
    existsSync: (candidate) => candidate === executable
  }), executable);
  assert.equal(resolveCodexCommand({
    platform: 'win32',
    findAppxInstallLocation: () => '',
    existsSync: () => false
  }), 'codex.exe');
});
