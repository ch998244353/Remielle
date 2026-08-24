const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { randomUUID } = require('node:crypto');
const { createPetMachine } = require('../src/domain/pet-machine.js');
const {
  MAX_MESSAGE_BYTES,
  createLineDecoder,
  createNotificationCoordinator,
  createPipeServer,
  notificationFromMessage,
  parseBridgeMessage
} = require('../src/codex-notifications.js');

function bridgeMessage(overrides = {}) {
  return {
    version: 1,
    sessionId: 'session-1',
    turnId: 'turn-1',
    event: 'UserPromptSubmit',
    sentAt: 1,
    ...overrides
  };
}

test('Pipe 输入只接受白名单字段、已知事件和受限长度', () => {
  assert.deepEqual(parseBridgeMessage(JSON.stringify(bridgeMessage())), bridgeMessage());
  assert.equal(parseBridgeMessage('{坏 JSON'), null);
  assert.equal(parseBridgeMessage(bridgeMessage({ event: 'HostedWebSearch' })), null);
  assert.equal(parseBridgeMessage({ ...bridgeMessage(), prompt: '不允许' }), null);
  assert.equal(parseBridgeMessage(bridgeMessage({ detailText: 'x'.repeat(257) })), null);
  assert.equal(parseBridgeMessage(bridgeMessage({ sessionId: 'x'.repeat(129) })), null);
  assert.equal(parseBridgeMessage(bridgeMessage({ sentAt: -1 })), null);
});

test('Named Pipe 支持分包和多消息，坏 JSON 与超长载荷只丢弃', {
  skip: process.platform !== 'win32'
}, async (t) => {
  const pipePath = `\\\\.\\pipe\\remiel-test-${randomUUID()}`;
  const received = [];
  const server = createPipeServer(pipePath, (message) => received.push(message));
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(pipePath, resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  async function writeChunks(chunks) {
    await new Promise((resolve, reject) => {
      const client = net.createConnection(pipePath);
      client.on('connect', () => {
        for (const chunk of chunks) client.write(chunk);
        client.end();
      });
      client.on('error', reject);
      client.on('close', resolve);
    });
  }

  const first = `${JSON.stringify(bridgeMessage())}\n`;
  const second = `${JSON.stringify(bridgeMessage({
    event: 'Stop',
    finalText: '完成',
    sentAt: 2
  }))}\n`;
  await writeChunks([first.slice(0, 17), first.slice(17), '{坏}\n', second]);
  await writeChunks(['x'.repeat(MAX_MESSAGE_BYTES + 1), '\n']);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(received.length, 2);
  assert.equal(received[0].event, 'UserPromptSubmit');
  assert.equal(received[1].event, 'Stop');
});

test('分帧器对无换行残留设硬上限', () => {
  const received = [];
  const decoder = createLineDecoder((message) => received.push(message), 128);
  decoder.push('x'.repeat(129));
  decoder.push(`\n${JSON.stringify(bridgeMessage())}\n`);
  assert.equal(received.length, 1);
});

test('通知优先显示安全摘要，旧 Bridge 仍回退通用文案，最终由状态机限制 50 code points', () => {
  assert.equal(notificationFromMessage(bridgeMessage({
    detailText: '新任务：缩短气泡距离'
  })).text, '新任务：缩短气泡距离');
  assert.equal(notificationFromMessage(bridgeMessage({
    event: 'PreToolUse',
    toolName: 'Bash',
    detailText: '正在运行 npm test'
  })).text, '正在运行 npm test');
  assert.equal(notificationFromMessage(bridgeMessage({
    event: 'PermissionRequest',
    detailText: '等待确认：修改 package.json'
  })).text, '等待确认：修改 package.json');
  assert.equal(notificationFromMessage(bridgeMessage({
    event: 'PreToolUse',
    toolName: 'Bash'
  })).text, '正在运行命令');
  assert.equal(notificationFromMessage(bridgeMessage({
    event: 'PreToolUse',
    toolName: 'apply_patch'
  })).text, '正在修改文件');
  assert.equal(notificationFromMessage(bridgeMessage({
    event: 'PreToolUse',
    toolName: 'Agent'
  })).text, '正在使用子智能体');
  assert.equal(notificationFromMessage(bridgeMessage({
    event: 'PreToolUse',
    toolName: 'mcp__service__tool'
  })).text, '正在调用工具');

  const mapped = notificationFromMessage(bridgeMessage({
    event: 'Stop',
    finalText: `  ${'😀'.repeat(80)}  `
  }));
  const result = createPetMachine().showMessage(mapped.text);
  assert.equal(result.accepted, true);
  assert.equal(Array.from(result.text).length, 50);
});

test('人物动作锁定时通知仍派发，由 renderer 决定只显示气泡', () => {
  const sent = [];
  const coordinator = createNotificationCoordinator({
    send: (notification) => sent.push(notification),
    initiallyIdle: false
  });

  coordinator.push(bridgeMessage({ event: 'PermissionRequest' }));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].text, 'Codex 正在等待你的确认');
});

test('当前通知回执后立即派发等待项，不依赖人物 idle 回执', () => {
  const sent = [];
  const coordinator = createNotificationCoordinator({
    send: (notification) => sent.push(notification),
    throttleMs: 0
  });

  coordinator.push(bridgeMessage({ event: 'PermissionRequest' }));
  coordinator.push(bridgeMessage({ event: 'PreToolUse', toolName: 'Bash' }));
  assert.equal(sent.length, 1);

  coordinator.acknowledge({ id: sent[0].id, status: 'accepted' });
  assert.equal(sent.length, 2);
  assert.equal(sent[1].text, '正在运行命令');
});

test('调度器保持双槽、critical 优先和普通进度 3 秒节流', () => {
  let clock = 0;
  let nextTimer = 0;
  const timers = new Map();
  const sent = [];
  const coordinator = createNotificationCoordinator({
    send: (notification) => sent.push(notification),
    now: () => clock,
    schedule(callback, delay) {
      const id = ++nextTimer;
      timers.set(id, { at: clock + delay, callback });
      return id;
    },
    cancelSchedule: (id) => timers.delete(id)
  });
  function advance(milliseconds) {
    clock += milliseconds;
    for (const [id, timer] of [...timers]) {
      if (timer.at <= clock) {
        timers.delete(id);
        timer.callback();
      }
    }
  }

  coordinator.push(bridgeMessage());
  assert.equal(sent.length, 1);
  coordinator.acknowledge({ id: sent[0].id, status: 'accepted' });
  coordinator.push(bridgeMessage({ event: 'PreToolUse', toolName: 'Bash', sentAt: 2 }));
  coordinator.push(bridgeMessage({ event: 'PreToolUse', toolName: 'apply_patch', sentAt: 3 }));
  coordinator.idle();
  assert.equal(sent.length, 1);
  advance(2999);
  assert.equal(sent.length, 1);
  advance(1);
  assert.equal(sent.length, 2);
  assert.equal(sent[1].text, '正在修改文件');

  coordinator.acknowledge({ id: sent[1].id, status: 'busy' });
  assert.ok(coordinator.snapshot().ordinary);
  coordinator.push(bridgeMessage({ event: 'PermissionRequest', sentAt: 4 }));
  assert.equal(sent.length, 3);
  assert.equal(sent[2].kind, 'critical');
  coordinator.acknowledge({ id: sent[2].id, status: 'accepted' });
  assert.equal(sent.length, 4);
  assert.equal(sent[3].kind, 'ordinary');
  coordinator.acknowledge({ id: sent[3].id, status: 'accepted' });

  coordinator.push(bridgeMessage({
    sessionId: 'session-2',
    turnId: 'turn-2',
    event: 'UserPromptSubmit',
    sentAt: 5
  }));
  assert.equal(coordinator.snapshot().critical, null);
  assert.ok(coordinator.snapshot().ordinary);
  coordinator.dispose();
});
