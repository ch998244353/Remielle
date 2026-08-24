const net = require('node:net');

const MAX_MESSAGE_BYTES = 8192;
const ALLOWED_EVENTS = new Set([
  'UserPromptSubmit',
  'PreToolUse',
  'PermissionRequest',
  'Stop'
]);
const ALLOWED_FIELDS = new Set([
  'version',
  'source',
  'sessionId',
  'turnId',
  'event',
  'toolName',
  'detailText',
  'finalText',
  'sentAt'
]);

function validString(value, maximum, allowEmpty = false) {
  return typeof value === 'string' &&
    value.length <= maximum &&
    (allowEmpty || value.length > 0);
}

function parseBridgeMessage(input) {
  let value;
  try {
    value = typeof input === 'string' ? JSON.parse(input) : input;
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (Object.keys(value).some((key) => !ALLOWED_FIELDS.has(key))) return null;
  if (
    value.version !== 1 ||
    (value.source !== undefined && value.source !== 'codex' && value.source !== 'deepseek') ||
    !validString(value.sessionId, 128) ||
    !validString(value.turnId, 128) ||
    !ALLOWED_EVENTS.has(value.event) ||
    !Number.isSafeInteger(value.sentAt) ||
    value.sentAt < 0
  ) return null;
  if (value.toolName !== undefined && !validString(value.toolName, 128, true)) return null;
  if (value.detailText !== undefined && !validString(value.detailText, 256, true)) return null;
  if (value.finalText !== undefined && !validString(value.finalText, 2048, true)) return null;
  if (value.event === 'Stop' && value.finalText !== undefined && typeof value.finalText !== 'string') {
    return null;
  }
  return {
    version: 1,
    source: value.source || 'codex',
    sessionId: value.sessionId,
    turnId: value.turnId,
    event: value.event,
    ...(value.toolName !== undefined ? { toolName: value.toolName } : {}),
    ...(value.detailText !== undefined ? { detailText: value.detailText } : {}),
    ...(value.finalText !== undefined ? { finalText: value.finalText } : {}),
    sentAt: value.sentAt
  };
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/gu, ' ') : '';
}

function notificationFromMessage(message) {
  const label = message.source === 'deepseek' ? 'DeepSeek' : 'Codex';
  const detail = normalizeText(message.detailText);
  if (message.event === 'UserPromptSubmit') {
    return { kind: 'ordinary', text: detail ? `${label} ${detail}` : `${label} 开始处理任务` };
  }
  if (message.event === 'PermissionRequest') {
    return { kind: 'critical', text: detail ? `${label} ${detail}` : `${label} 正在等待你的确认` };
  }
  if (message.event === 'Stop') {
    const summary = normalizeText(message.finalText);
    return {
      kind: 'critical',
      text: detail || summary
        ? `${label} ${detail || `已结束：${summary}`}`
        : `${label} 已结束`
    };
  }

  if (detail) return { kind: 'ordinary', text: `${label} ${detail}` };

  const toolName = message.toolName || '';
  if (/^(Bash|exec_command|write_stdin)$/iu.test(toolName)) {
    return { kind: 'ordinary', text: `${label} 正在运行命令` };
  }
  if (/^(apply_patch|Edit|Write)$/iu.test(toolName)) {
    return { kind: 'ordinary', text: `${label} 正在修改文件` };
  }
  if (/^(Agent|spawn_agent|send_message|followup_task)$/iu.test(toolName)) {
    return { kind: 'ordinary', text: `${label} 正在使用子智能体` };
  }
  return { kind: 'ordinary', text: `${label} 正在调用工具` };
}

function notificationBridgeRequired(...states) {
  return states.some((state) => state === 'enabled' || state === 'needsRepair');
}

function createNotificationCoordinator({
  send,
  now = Date.now,
  schedule = setTimeout,
  cancelSchedule = clearTimeout,
  throttleMs = 3000,
  initiallyIdle = true,
  sourceEnabled = () => true
}) {
  if (typeof send !== 'function') throw new TypeError('send must be a function');
  if (typeof sourceEnabled !== 'function') throw new TypeError('sourceEnabled must be a function');
  let activeSessionId = null;
  let ordinarySlot = null;
  let criticalSlot = null;
  let inFlight = null;
  let rendererIdle = initiallyIdle;
  let lastOrdinaryAcceptedAt = Number.NEGATIVE_INFINITY;
  let timer = null;
  let sequence = 0;

  function cancelTimer() {
    if (timer !== null) cancelSchedule(timer);
    timer = null;
  }

  function armOrdinaryTimer(delay) {
    if (timer !== null) return;
    timer = schedule(() => {
      timer = null;
      flush();
    }, delay);
  }

  function flush() {
    if (inFlight) return false;
    let notification = criticalSlot;
    if (notification) {
      criticalSlot = null;
    } else if (ordinarySlot) {
      const remaining = throttleMs - (now() - lastOrdinaryAcceptedAt);
      if (remaining > 0) {
        armOrdinaryTimer(remaining);
        return false;
      }
      notification = ordinarySlot;
      ordinarySlot = null;
    }
    if (!notification) return false;
    cancelTimer();
    inFlight = notification;
    send({ id: notification.id, text: notification.text, kind: notification.kind });
    return true;
  }

  function push(message) {
    const parsed = parseBridgeMessage(message);
    if (!parsed) return false;
    if (!sourceEnabled(parsed.source)) return false;
    const sessionKey = `${parsed.source}:${parsed.sessionId}`;
    if (sessionKey !== activeSessionId) {
      activeSessionId = sessionKey;
      ordinarySlot = null;
      criticalSlot = null;
      cancelTimer();
    }
    const mapped = notificationFromMessage(parsed);
    const notification = {
      ...mapped,
      id: `${parsed.source[0]}-${parsed.sessionId.slice(0, 22)}-${++sequence}`,
      sessionId: sessionKey,
      source: parsed.source
    };
    if (mapped.kind === 'critical') criticalSlot = notification;
    else ordinarySlot = notification;
    flush();
    return true;
  }

  function acknowledge(result) {
    if (
      !inFlight ||
      result?.id !== inFlight.id ||
      !['accepted', 'busy', 'empty'].includes(result.status)
    ) return false;
    const completed = inFlight;
    inFlight = null;
    if (result.status === 'accepted') {
      rendererIdle = false;
      if (completed.kind === 'ordinary') lastOrdinaryAcceptedAt = now();
    } else if (result.status === 'busy') {
      rendererIdle = false;
      if (completed.sessionId === activeSessionId) {
        if (completed.kind === 'critical') criticalSlot ||= completed;
        else ordinarySlot ||= completed;
      }
    }
    if (result.status !== 'busy') flush();
    return true;
  }

  function idle() {
    rendererIdle = true;
    flush();
  }

  function discardSource(source) {
    if (source !== 'codex' && source !== 'deepseek') return false;
    let discarded = false;
    if (ordinarySlot?.source === source) {
      ordinarySlot = null;
      discarded = true;
    }
    if (criticalSlot?.source === source) {
      criticalSlot = null;
      discarded = true;
    }
    if (inFlight?.source === source) {
      inFlight = null;
      discarded = true;
    }
    if (activeSessionId?.startsWith(`${source}:`)) activeSessionId = null;
    if (discarded) {
      cancelTimer();
      flush();
    }
    return discarded;
  }

  function dispose() {
    cancelTimer();
    ordinarySlot = null;
    criticalSlot = null;
    inFlight = null;
  }

  function snapshot() {
    return {
      activeSessionId,
      ordinary: ordinarySlot?.id || null,
      critical: criticalSlot?.id || null,
      inFlight: inFlight?.id || null,
      rendererIdle
    };
  }

  return { acknowledge, discardSource, dispose, flush, idle, push, snapshot };
}

function createLineDecoder(onMessage, maximumBytes = MAX_MESSAGE_BYTES) {
  let buffered = Buffer.alloc(0);
  return {
    push(chunk) {
      if (!Buffer.isBuffer(chunk)) chunk = Buffer.from(chunk);
      buffered = Buffer.concat([buffered, chunk]);
      if (buffered.length > maximumBytes * 2) {
        buffered = Buffer.alloc(0);
        return false;
      }
      let newline;
      while ((newline = buffered.indexOf(0x0a)) !== -1) {
        const frame = buffered.subarray(0, newline);
        buffered = buffered.subarray(newline + 1);
        if (frame.length === 0 || frame.length > maximumBytes) continue;
        const message = parseBridgeMessage(frame.toString('utf8'));
        if (message) onMessage(message);
      }
      if (buffered.length > maximumBytes) buffered = Buffer.alloc(0);
      return true;
    },
    end() {
      buffered = Buffer.alloc(0);
    }
  };
}

function createPipeServer(pipePath, onMessage) {
  if (typeof pipePath !== 'string' || !pipePath) throw new TypeError('pipePath is required');
  const server = net.createServer((socket) => {
    const decoder = createLineDecoder(onMessage);
    socket.setTimeout(1000, () => socket.destroy());
    socket.on('data', (chunk) => decoder.push(chunk));
    socket.on('end', () => decoder.end());
    socket.on('error', () => decoder.end());
  });
  server.maxConnections = 8;
  return server;
}

module.exports = {
  MAX_MESSAGE_BYTES,
  createLineDecoder,
  createNotificationCoordinator,
  createPipeServer,
  notificationBridgeRequired,
  notificationFromMessage,
  parseBridgeMessage
};
