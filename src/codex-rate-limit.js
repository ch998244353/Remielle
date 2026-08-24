const readline = require('node:readline');
const { spawn } = require('node:child_process');

function formatRateLimit(result, timeZone) {
  const primary = result?.rateLimits?.primary;
  if (
    !Number.isFinite(primary?.usedPercent) ||
    !Number.isSafeInteger(primary?.resetsAt) ||
    primary.resetsAt <= 0
  ) throw new Error('invalid rate limit response');

  const remaining = Math.round(Math.min(100, Math.max(0, 100 - primary.usedPercent)));
  const parts = new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    ...(timeZone ? { timeZone } : {})
  }).formatToParts(new Date(primary.resetsAt * 1000));
  const value = (type) => parts.find((part) => part.type === type)?.value;
  return `Codex 剩余 ${remaining}%，${value('month')}月${value('day')}日 ${value('hour')}:${value('minute')} 重置`;
}

function queryCodexRateLimit({
  spawnProcess = spawn,
  command = 'codex.exe',
  timeoutMs = 8000,
  signal,
  timeZone
} = {}) {
  if (signal?.aborted) return Promise.reject(new Error('Codex rate limit request aborted'));

  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnProcess(command, ['app-server'], {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'ignore']
      });
    } catch (error) {
      reject(error);
      return;
    }

    const lines = readline.createInterface({ input: child.stdout });
    let settled = false;
    const timer = setTimeout(
      () => finish(new Error('Codex rate limit request timed out')),
      timeoutMs
    );

    function finish(error, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      lines.close();
      child.removeListener('error', onError);
      child.removeListener('exit', onExit);
      child.stdin.end();
      child.kill();
      if (error) reject(error);
      else resolve(value);
    }

    function send(message) {
      child.stdin.write(`${JSON.stringify(message)}\n`);
    }

    function onAbort() {
      finish(new Error('Codex rate limit request aborted'));
    }

    function onError(error) {
      finish(error);
    }

    function onExit() {
      finish(new Error('Codex app-server exited before returning rate limits'));
    }

    child.on('error', onError);
    child.on('exit', onExit);
    signal?.addEventListener('abort', onAbort, { once: true });
    lines.on('line', (line) => {
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        finish(new Error('invalid app-server response'));
        return;
      }

      if (message.id === 0) {
        if (message.error) {
          finish(new Error('Codex app-server initialization failed'));
          return;
        }
        send({ method: 'initialized', params: {} });
        send({ method: 'account/rateLimits/read', id: 1 });
      } else if (message.id === 1) {
        if (message.error) {
          finish(new Error('Codex rate limit request failed'));
          return;
        }
        try {
          finish(null, formatRateLimit(message.result, timeZone));
        } catch (error) {
          finish(error);
        }
      }
    });

    send({
      method: 'initialize',
      id: 0,
      params: {
        clientInfo: {
          name: 'remiel_desktop_pet',
          title: 'Remiel Desktop Pet',
          version: '0.3.0'
        }
      }
    });
  });
}

module.exports = { queryCodexRateLimit };
