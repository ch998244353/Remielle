const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const net = require('node:net');
const {
  HOOK_EVENTS,
  HOOK_MARKER,
  HookConfigError,
  buildForwarderScript,
  inspectCodexHooks,
  installCodexHooks,
  uninstallCodexHooks
} = require('../src/codex-hook.js');

async function makeDirectories(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'remiel-hooks-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const codexHome = path.join(root, 'codex');
  const userData = path.join(root, 'user-data');
  await fs.mkdir(codexHome, { recursive: true });
  return { codexHome, userData };
}

function ownHandlers(config) {
  return Object.values(config.hooks || {})
    .flatMap((groups) => groups)
    .flatMap((group) => group.hooks)
    .filter((handler) => handler.statusMessage === HOOK_MARKER);
}

test('Hook 安装幂等、创建备份并保留其他用户 Hook，停用只移除自己', async (t) => {
  const paths = await makeDirectories(t);
  const hooksFile = path.join(paths.codexHome, 'hooks.json');
  const original = {
    description: '用户自己的配置',
    hooks: {
      PreToolUse: [{
        matcher: '^Bash$',
        hooks: [{ type: 'command', command: 'other-tool.exe' }]
      }],
      PostToolUse: [{ hooks: [{ type: 'command', command: 'post-tool.exe' }] }]
    }
  };
  await fs.writeFile(hooksFile, `${JSON.stringify(original, null, 2)}\n`, 'utf8');

  const first = await installCodexHooks(paths);
  assert.ok(first.backupFile);
  const installed = JSON.parse(await fs.readFile(hooksFile, 'utf8'));
  assert.equal(ownHandlers(installed).length, HOOK_EVENTS.length);
  assert.equal(installed.description, original.description);
  assert.equal(installed.hooks.PreToolUse[0].hooks[0].command, 'other-tool.exe');
  assert.equal(installed.hooks.PostToolUse[0].hooks[0].command, 'post-tool.exe');
  assert.match(ownHandlers(installed)[0].commandWindows, /-WindowStyle Hidden/u);
  assert.equal(ownHandlers(installed)[0].async, true);
  assert.equal((await inspectCodexHooks(paths)).state, 'enabled');

  const second = await installCodexHooks(paths);
  assert.equal(second.changed, false);
  assert.equal(second.backupFile, null);
  assert.equal(ownHandlers(JSON.parse(await fs.readFile(hooksFile, 'utf8'))).length, 4);

  const removed = await uninstallCodexHooks(paths);
  assert.ok(removed.backupFile);
  const after = JSON.parse(await fs.readFile(hooksFile, 'utf8'));
  assert.equal(ownHandlers(after).length, 0);
  assert.equal(after.hooks.PreToolUse[0].hooks[0].command, 'other-tool.exe');
  assert.equal(after.hooks.PostToolUse[0].hooks[0].command, 'post-tool.exe');
  assert.equal((await inspectCodexHooks(paths)).state, 'disabled');
});

test('首次新建不伪造备份，非法 hooks.json 拒绝覆盖', async (t) => {
  const fresh = await makeDirectories(t);
  const installed = await installCodexHooks(fresh);
  assert.equal(installed.backupFile, null);

  const broken = await makeDirectories(t);
  const hooksFile = path.join(broken.codexHome, 'hooks.json');
  await fs.writeFile(hooksFile, '{坏 JSON', 'utf8');
  await assert.rejects(() => installCodexHooks(broken), HookConfigError);
  assert.equal(await fs.readFile(hooksFile, 'utf8'), '{坏 JSON');
  await assert.rejects(
    () => fs.access(path.join(broken.userData, 'codex-hook-forwarder.ps1')),
    { code: 'ENOENT' }
  );
  assert.equal((await inspectCodexHooks(broken)).state, 'invalid');
});

test('隐藏 PowerShell 转发器在桌宠未运行时快速无操作退出且不回显输入', {
  skip: process.platform !== 'win32'
}, async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'remiel-forwarder-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const scriptFile = path.join(root, 'forwarder.ps1');
  await fs.writeFile(
    scriptFile,
    buildForwarderScript(`remiel-absent-${randomUUID()}`),
    'utf8'
  );
  assert.match(await fs.readFile(scriptFile, 'utf8'), /\$Pipe\.Connect\(150\)/u);
  const startedAt = Date.now();
  const result = await new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-WindowStyle',
      'Hidden',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      scriptFile
    ], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stderr, stdout }));
    child.stdin.end(JSON.stringify({
      session_id: 'session-1',
      turn_id: 'turn-1',
      hook_event_name: 'UserPromptSubmit',
      prompt: '绝不能回显的提示词',
      transcript_path: 'C:\\secret\\transcript.jsonl',
      model: 'secret-model'
    }));
  });
  assert.equal(result.code, 0);
  assert.equal(result.stdout, '{}');
  assert.equal(result.stderr, '');
  assert.ok(Date.now() - startedAt < 10000);
  assert.doesNotMatch(result.stdout, /提示词|transcript|model/u);
});

test('真实 PowerShell 转发到 Named Pipe 时只保留白名单字段和工作目录 basename', {
  skip: process.platform !== 'win32'
}, async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'remiel-forwarder-pipe-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const pipeName = `remiel-forwarder-${randomUUID()}`;
  const pipePath = `\\\\.\\pipe\\${pipeName}`;
  let receive;
  const received = new Promise((resolve) => { receive = resolve; });
  const server = net.createServer((socket) => {
    socket.once('data', (chunk) => receive(chunk.toString('utf8')));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(pipePath, resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const scriptFile = path.join(root, 'forwarder.ps1');
  const diagnosticScript = buildForwarderScript(pipeName).replace(
    '} catch {\n}\n\n[Console]::Out.Write',
    '} catch {\n  [Console]::Error.Write($_.Exception.Message)\n}\n\n[Console]::Out.Write'
  );
  await fs.writeFile(scriptFile, diagnosticScript, 'utf8');
  const hookInput = {
    session_id: 'session-allowed',
    turn_id: 'turn-allowed',
    hook_event_name: 'Stop',
    last_assistant_message: '允许的最终摘要',
    prompt: '禁止发送的提示词',
    transcript_path: 'C:\\secret\\transcript.jsonl',
    cwd: 'C:\\private-root\\桌宠创作',
    model: 'secret-model',
    tool_input: { command: 'secret command' }
  };
  const childResult = await new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden',
      '-ExecutionPolicy', 'Bypass', '-File', scriptFile
    ], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stderr, stdout }));
    child.stdin.end(JSON.stringify(hookInput));
  });
  assert.equal(childResult.code, 0);
  assert.equal(childResult.stdout, '{}');
  assert.equal(childResult.stderr, '');
  let timeout;
  const rawMessage = await Promise.race([
    received,
    new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error('pipe timeout')), 1500);
    })
  ]).finally(() => clearTimeout(timeout));
  const message = JSON.parse(rawMessage.trim());

  assert.deepEqual(Object.keys(message).sort(), [
    'event', 'finalText', 'projectName', 'sentAt', 'sessionId', 'turnId', 'version'
  ]);
  assert.equal(message.finalText, '允许的最终摘要');
  assert.equal(message.projectName, '桌宠创作');
  assert.doesNotMatch(JSON.stringify(message), /提示词|transcript|private-root|model|command/u);
});

test('真实 PowerShell 只发送任务预览、安全命令、basename 和审批摘要', {
  skip: process.platform !== 'win32'
}, async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'remiel-forwarder-detail-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const pipeName = `remiel-detail-${randomUUID()}`;
  const pipePath = `\\\\.\\pipe\\${pipeName}`;
  const messages = [];
  let notify = null;
  const server = net.createServer((socket) => {
    let raw = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => { raw += chunk; });
    socket.on('end', () => {
      messages.push(JSON.parse(raw.trim()));
      notify?.();
      notify = null;
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(pipePath, resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const scriptFile = path.join(root, 'forwarder.ps1');
  await fs.writeFile(scriptFile, buildForwarderScript(pipeName), 'utf8');
  async function forward(input) {
    const targetCount = messages.length + 1;
    const messageArrived = new Promise((resolve) => { notify = resolve; });
    const result = await new Promise((resolve, reject) => {
      const child = spawn('powershell.exe', [
        '-NoLogo', '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden',
        '-ExecutionPolicy', 'Bypass', '-File', scriptFile
      ], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
      child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
      child.on('error', reject);
      child.on('close', (code) => resolve({ code, stderr, stdout }));
      child.stdin.end(JSON.stringify({
        session_id: 'session-detail',
        turn_id: `turn-${targetCount}`,
        cwd: 'C:\\Users\\ch\\Desktop\\桌宠创作\\',
        ...input
      }));
    });
    assert.deepEqual(result, { code: 0, stderr: '', stdout: '{}' });
    if (messages.length < targetCount) await messageArrived;
    return messages.at(-1);
  }

  const prompt = await forward({
    hook_event_name: 'UserPromptSubmit',
    prompt: `请缩短气泡距离并准备公开发布 ${'a'.repeat(260)} PROMPT_SECRET_TAIL`,
    transcript_path: 'C:\\secret\\transcript.jsonl',
    model: 'SECRET_MODEL'
  });
  assert.match(prompt.detailText, /^新任务：请缩短气泡距离并准备公开发布/u);
  assert.doesNotMatch(JSON.stringify(prompt), /PROMPT_SECRET_TAIL|transcript|SECRET_MODEL/u);

  const command = await forward({
    hook_event_name: 'PreToolUse',
    tool_name: 'exec_command',
    tool_input: {
      command: 'npm test -- --token COMMAND_SECRET --password=PASSWORD_SECRET -H "Authorization: Bearer BEARER_SECRET" C:\\secret\\work'
    },
    tool_output: 'TOOL_OUTPUT_SECRET'
  });
  assert.equal(command.detailText, '正在运行 npm test');
  assert.equal(command.projectName, '桌宠创作');
  assert.equal(
    command.commandText,
    'npm test -- --token *** --password=*** -H "Authorization: Bearer ***" C:\\secret\\work'
  );
  assert.doesNotMatch(
    JSON.stringify(command),
    /COMMAND_SECRET|PASSWORD_SECRET|BEARER_SECRET|TOOL_OUTPUT_SECRET/u
  );

  const longCommand = await forward({
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command: `echo ${'x'.repeat(1100)}` }
  });
  assert.equal(Array.from(longCommand.commandText).length, 1024);
  assert.match(longCommand.commandText, /命令过长，已截断$/u);

  const patch = await forward({
    hook_event_name: 'PreToolUse',
    tool_name: 'apply_patch',
    tool_input: {
      patch: '*** Update File: C:\\Users\\name\\private\\package.json\n@@\n-SECRET_PATCH\n+changed'
    }
  });
  assert.equal(patch.detailText, '正在修改 package.json');
  assert.doesNotMatch(JSON.stringify(patch), /Users|private|SECRET_PATCH/u);

  const approval = await forward({
    hook_event_name: 'PermissionRequest',
    tool_name: 'Bash',
    tool_input: { command: 'git status --porcelain APPROVAL_SECRET' }
  });
  assert.equal(approval.detailText, '等待确认：运行 git status');
  assert.equal(approval.commandText, 'git status --porcelain APPROVAL_SECRET');
});
