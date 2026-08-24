import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

export const name = 'remiel-dsh-bridge';
export const inject = ['credentials'];
export const SUPPORTED_DSH_VERSION = '0.1.1-rc.2';
export const NOTIFICATION_PIPE_PATH = '\\\\.\\pipe\\remiel-desktop-pet-codex-v1';
export const BALANCE_PIPE_PATH = '\\\\.\\pipe\\remiel-desktop-pet-deepseek-v1';

const MAX_NOTIFICATION_BYTES = 8192;
const MAX_REQUEST_BYTES = 256;
const MAX_FINAL_CHARS = 40;
const MAX_COMMAND_CHARS = 1024;
const COMMAND_TRUNCATION = '…命令过长，已截断';

function bound(text, limit) {
  const points = Array.from(text);
  return points.length <= limit ? text : `${points.slice(0, limit - 1).join('')}…`;
}

function cleanText(value) {
  return typeof value === 'string' ? value.replace(/\s+/gu, ' ').trim() : '';
}

function textFromContent(content) {
  if (!Array.isArray(content)) return '';
  return cleanText(content
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join(' '));
}

function safeBasename(value) {
  if (typeof value !== 'string' || value.length === 0) return '';
  return cleanText(path.win32.basename(value.replaceAll('/', '\\'))).replace(/[^\p{L}\p{N}._-]/gu, '');
}

function parsedArguments(raw) {
  if (typeof raw !== 'string' || raw.length > 4096) return {};
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function isShellTool(value) {
  return /bash|pwsh|shell|command|exec/u.test(cleanText(value).toLowerCase());
}

function safeCommandText(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  let command = value.trim()
    .replace(/(--?(?:api[-_]?key|token|password|passwd|secret|authorization))(=|\s+)(?:"[^"]*"|'[^']*'|[^\s]+)/giu, '$1$2***')
    .replace(/\b([A-Z0-9_]*(?:TOKEN|API_KEY|APIKEY|PASSWORD|PASSWD|SECRET|AUTHORIZATION)[A-Z0-9_]*)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s]+)/gimu, '$1=***')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+=*/giu, '$1***')
    .replace(/\bsk-[A-Za-z0-9_-]{6,}\b/giu, 'sk-***');
  const points = Array.from(command);
  if (points.length > MAX_COMMAND_CHARS) {
    command = `${points.slice(0, MAX_COMMAND_CHARS - Array.from(COMMAND_TRUNCATION).length).join('')}${COMMAND_TRUNCATION}`;
  }
  return command;
}

function commandHead(command) {
  if (typeof command !== 'string') return '';
  const tokens = command.match(/"[^"]*"|'[^']*'|[^\s]+/gu)?.slice(0, 2) || [];
  const safe = tokens.map((token) => {
    const unquoted = token.replace(/^["']|["']$/gu, '');
    return safeBasename(unquoted);
  }).filter(Boolean);
  if (safe[1]?.startsWith('-')) safe.pop();
  return safe.join(' ');
}

function toolSummary(nameValue, rawArguments) {
  const toolName = cleanText(nameValue).toLowerCase();
  const args = parsedArguments(rawArguments);
  if (isShellTool(toolName)) {
    const head = commandHead(args.command ?? args.cmd);
    return head ? `正在运行 ${head}` : '正在运行命令';
  }
  if (/apply_patch|str_replace|write|edit/.test(toolName)) {
    const file = safeBasename(args.path ?? args.file_path ?? args.file);
    return file ? `正在修改 ${file}` : '正在修改文件';
  }
  if (/read/.test(toolName)) {
    const file = safeBasename(args.path ?? args.file_path ?? args.file);
    return file ? `正在读取 ${file}` : '正在读取文件';
  }
  if (/search|find|grep|glob/.test(toolName)) return '正在搜索文件';
  if (/agent|subagent/.test(toolName)) return '正在使用子智能体';
  if (/web|fetch|browse/.test(toolName)) return '正在查询网络';
  return '正在调用工具';
}

function approvalSummary(toolName) {
  const summary = toolSummary(toolName, '{}').replace(/^正在/gu, '');
  return `等待确认：${summary}`;
}

function turnEndText(reason) {
  return {
    error: '任务失败',
    aborted: '任务已取消',
    blocked: '任务被阻止',
    'max-tokens': '达到输出上限',
    interrupted: '任务被中断'
  }[reason?.kind] || '';
}

export function createEventBridge(send) {
  const finalText = new Map();
  return (session, event) => {
    const sessionId = cleanText(String(session?.id ?? ''));
    if (!sessionId || sessionId.length > 128 || !event?.data) return;
    const turnId = String(event.data.turn ?? event.seq ?? 0);
    const base = {
      version: 1,
      source: 'deepseek',
      sessionId,
      turnId: turnId.slice(0, 128),
      projectName: safeBasename(session?.header?.cwd) || '未知项目',
      sentAt: Date.now()
    };
    if (event.type === 'user/message') {
      if (event.data.source?.kind !== 'user') return;
      const excerpt = bound(textFromContent(event.data.content), 18);
      send({ ...base, event: 'UserPromptSubmit', ...(excerpt ? { detailText: `新任务：${excerpt}` } : {}) });
      return;
    }
    if (event.type === 'tool/call') {
      const args = parsedArguments(event.data.arguments);
      const commandText = isShellTool(event.data.name)
        ? safeCommandText(args.command ?? args.cmd)
        : '';
      send({
        ...base,
        event: 'PreToolUse',
        toolName: cleanText(event.data.name).slice(0, 128),
        detailText: toolSummary(event.data.name, event.data.arguments),
        ...(commandText ? { commandText } : {})
      });
      return;
    }
    if (event.type === 'approval/asked') {
      send({ ...base, event: 'PermissionRequest', detailText: approvalSummary(event.data.toolName) });
      return;
    }
    if (event.type === 'assistant/message') {
      const text = textFromContent(event.data.message?.content);
      if (text) finalText.set(sessionId, bound(text, MAX_FINAL_CHARS));
      return;
    }
    if (event.type !== 'turn/end') return;
    const detailText = turnEndText(event.data.reason);
    const summary = finalText.get(sessionId);
    finalText.delete(sessionId);
    send({
      ...base,
      event: 'Stop',
      ...(detailText ? { detailText } : {}),
      ...(!detailText && summary ? { finalText: summary } : {})
    });
  };
}

export function sendNotification(message, pipePath = NOTIFICATION_PIPE_PATH) {
  const payload = Buffer.from(`${JSON.stringify(message)}\n`, 'utf8');
  if (payload.length > MAX_NOTIFICATION_BYTES) return;
  const socket = net.createConnection(pipePath);
  socket.setTimeout(200, () => socket.destroy());
  socket.once('connect', () => socket.end(payload));
  socket.once('error', () => socket.destroy());
}

function formatBalance(body) {
  if (!body || typeof body.is_available !== 'boolean' || !Array.isArray(body.balance_infos)) return null;
  if (body.is_available === false) return 'DeepSeek 余额不可用';
  if (body.balance_infos.length === 0 || body.balance_infos.length > 2) return null;
  const parts = [];
  const currencies = new Set();
  for (const info of body.balance_infos) {
    if (
      !info ||
      typeof info.currency !== 'string' ||
      !['CNY', 'USD'].includes(info.currency) ||
      currencies.has(info.currency) ||
      typeof info.total_balance !== 'string' ||
      info.total_balance.length > 14 ||
      !/^-?\d+(?:\.\d+)?$/u.test(info.total_balance)
    ) return null;
    currencies.add(info.currency);
    parts.push(`${info.currency} ${info.total_balance}`);
  }
  return bound(`DeepSeek 余额：${parts.join('，')}`, 50);
}

export async function readDeepSeekBalance({
  credentials,
  fetchImpl = fetch,
  timeoutMs = 8000
}) {
  let credential;
  try {
    credential = await credentials.resolve('DEEPSEEK_API_KEY');
  } catch {
    return { ok: false, code: 'not_configured' };
  }
  if (typeof credential?.value !== 'string' || credential.value.length === 0) {
    return { ok: false, code: 'not_configured' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  try {
    const response = await fetchImpl('https://api.deepseek.com/user/balance', {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${credential.value}`
      },
      signal: controller.signal
    });
    if (!response?.ok) return { ok: false, code: 'request_failed' };
    const text = formatBalance(await response.json());
    return text ? { ok: true, text } : { ok: false, code: 'invalid_response' };
  } catch {
    return { ok: false, code: 'request_failed' };
  } finally {
    clearTimeout(timer);
    credential = undefined;
  }
}

export function createBalanceServer({
  pipePath = BALANCE_PIPE_PATH,
  credentials,
  fetchImpl = fetch,
  fixedResult
}) {
  return net.createServer((socket) => {
    let buffer = Buffer.alloc(0);
    let handled = false;
    const reply = (result) => {
      if (handled) return;
      handled = true;
      socket.end(`${JSON.stringify({ version: 1, ...result })}\n`);
    };
    socket.on('data', async (chunk) => {
      if (handled) return;
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length > MAX_REQUEST_BYTES) return reply({ ok: false, code: 'invalid_response' });
      const newline = buffer.indexOf(10);
      if (newline === -1) return;
      let request;
      try {
        request = JSON.parse(buffer.subarray(0, newline).toString('utf8'));
      } catch {
        return reply({ ok: false, code: 'invalid_response' });
      }
      if (
        Object.keys(request).some((key) => !['version', 'type'].includes(key)) ||
        request.version !== 1 ||
        request.type !== 'balance/read'
      ) return reply({ ok: false, code: 'invalid_response' });
      reply(fixedResult || await readDeepSeekBalance({ credentials, fetchImpl }));
    });
    socket.on('error', () => socket.destroy());
  });
}

export function findHarnessVersion(entry = process.argv[1]) {
  let directory = path.dirname(path.resolve(entry || '.'));
  for (let index = 0; index < 10; index += 1) {
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
      if (manifest.name === '@deepseek-ai/dsh') return manifest.version;
    } catch {}
    const parent = path.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return null;
}

export function apply(ctx) {
  const version = findHarnessVersion();
  if (version !== SUPPORTED_DSH_VERSION) {
    console.warn(`[remiel-dsh-bridge] unsupported Harness version: ${version ?? 'unknown'}`);
  } else {
    ctx.on('session/event', createEventBridge(sendNotification));
  }
  ctx.effect(() => {
    const server = createBalanceServer({
      credentials: ctx.credentials,
      ...(version === SUPPORTED_DSH_VERSION
        ? {}
        : { fixedResult: { ok: false, code: 'unsupported_version' } })
    });
    server.on('error', (error) => {
      console.warn(`[remiel-dsh-bridge] balance service unavailable: ${error.code ?? 'unknown'}`);
    });
    server.listen(BALANCE_PIPE_PATH);
    return () => new Promise((resolve) => {
      if (!server.listening) return resolve();
      server.close(() => resolve());
    });
  });
}
