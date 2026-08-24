const fs = require('node:fs/promises');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const DSH_PACKAGE = '@deepseek-ai/dsh';
const DSH_VERSION = '0.1.1-rc.2';
const DSH_PROFILE = 'web';
const BUNDLE_NAME = 'remiel-dsh-bridge';
const DEEPSEEK_BALANCE_PIPE_NAME = 'remiel-desktop-pet-deepseek-v1';
const DEEPSEEK_BALANCE_PIPE_PATH = `\\\\.\\pipe\\${DEEPSEEK_BALANCE_PIPE_NAME}`;
const BUNDLE_FILES = Object.freeze(['index.js', 'cordis.patch.yml', 'package.json']);
const MAX_BALANCE_RESPONSE_BYTES = 2048;

class DeepSeekBalanceError extends Error {
  constructor(code) {
    super(code);
    this.name = 'DeepSeekBalanceError';
    this.code = code;
  }
}

function resolveDshHome(env = process.env) {
  return env.DSH_HOME || path.join(os.homedir(), '.dsh');
}

async function stageDeepSeekBundle({
  userData,
  sourceDirectory = path.join(__dirname, 'integrations', 'deepseek-harness')
}) {
  const targetDirectory = path.join(userData, 'deepseek-harness', BUNDLE_NAME);
  await fs.mkdir(targetDirectory, { recursive: true });
  for (const file of BUNDLE_FILES) {
    await fs.copyFile(path.join(sourceDirectory, file), path.join(targetDirectory, file));
  }
  return targetDirectory;
}

function buildDshPluginCommand(action, bundlePath) {
  if (action !== 'add' && action !== 'remove') throw new TypeError('unsupported plugin action');
  const args = [
    '--yes', `${DSH_PACKAGE}@${DSH_VERSION}`,
    'plugin', '--profile', DSH_PROFILE, action
  ];
  args.push(action === 'add' ? bundlePath : BUNDLE_NAME);
  return {
    command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
    args
  };
}

async function runDshPluginCommand({
  action,
  bundlePath,
  dshHome = resolveDshHome(),
  spawnProcess = spawn,
  timeoutMs = 120000
}) {
  const invocation = buildDshPluginCommand(action, bundlePath);
  await new Promise((resolve, reject) => {
    const child = spawnProcess(invocation.command, invocation.args, {
      env: { ...process.env, DSH_HOME: dshHome },
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });
    child.stdout?.resume();
    child.stderr?.resume();
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('DeepSeek Harness CLI timed out'));
    }, timeoutMs);
    timer.unref?.();
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`DeepSeek Harness CLI exited with code ${code}`));
    });
  });
}

async function inspectDeepSeekPlugin({ dshHome = resolveDshHome() } = {}) {
  const manifestFile = path.join(dshHome, 'profiles', DSH_PROFILE, 'package.json');
  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8'));
  } catch (error) {
    return { state: error.code === 'ENOENT' ? 'disabled' : 'invalid', manifestFile };
  }
  const hasDependency = typeof manifest?.dependencies?.[BUNDLE_NAME] === 'string';
  const bundles = manifest?.dsh?.profile?.bundles;
  if (!Array.isArray(bundles)) return { state: 'invalid', manifestFile };
  const hasBundle = bundles.includes(BUNDLE_NAME);
  return {
    state: hasDependency === hasBundle ? (hasBundle ? 'enabled' : 'disabled') : 'needsRepair',
    manifestFile
  };
}

function parseBalanceResponse(line) {
  let value;
  try {
    value = JSON.parse(line);
  } catch {
    throw new DeepSeekBalanceError('invalid_response');
  }
  if (!value || value.version !== 1 || typeof value.ok !== 'boolean') {
    throw new DeepSeekBalanceError('invalid_response');
  }
  if (value.ok === true) {
    if (
      Object.keys(value).some((key) => !['version', 'ok', 'text'].includes(key)) ||
      typeof value.text !== 'string' ||
      !value.text.startsWith('DeepSeek 余额') ||
      Array.from(value.text).length > 50
    ) throw new DeepSeekBalanceError('invalid_response');
    return { ok: true, text: value.text };
  }
  if (
    Object.keys(value).some((key) => !['version', 'ok', 'code'].includes(key)) ||
    !['not_configured', 'request_failed', 'invalid_response', 'unsupported_version'].includes(value.code)
  ) throw new DeepSeekBalanceError('invalid_response');
  return { ok: false, code: value.code };
}

function queryDeepSeekBalance({
  pipePath = DEEPSEEK_BALANCE_PIPE_PATH,
  signal,
  timeoutMs = 9000,
  connect = net.createConnection
} = {}) {
  return new Promise((resolve, reject) => {
    let bytes = 0;
    let buffer = '';
    let settled = false;
    const socket = connect(pipePath);
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      socket.destroy();
      if (error) reject(error);
      else resolve(result);
    };
    const onAbort = () => finish(new DeepSeekBalanceError('cancelled'));
    const timer = setTimeout(() => finish(new DeepSeekBalanceError('timeout')), timeoutMs);
    timer.unref?.();
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) return onAbort();
    socket.once('connect', () => socket.write('{"version":1,"type":"balance/read"}\n'));
    socket.once('error', () => finish(new DeepSeekBalanceError('harness_not_running')));
    socket.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_BALANCE_RESPONSE_BYTES) {
        finish(new DeepSeekBalanceError('invalid_response'));
        return;
      }
      buffer += chunk.toString('utf8');
      const newline = buffer.indexOf('\n');
      if (newline === -1) return;
      try {
        finish(null, parseBalanceResponse(buffer.slice(0, newline)));
      } catch (error) {
        finish(error);
      }
    });
  });
}

module.exports = {
  BUNDLE_NAME,
  DEEPSEEK_BALANCE_PIPE_NAME,
  DEEPSEEK_BALANCE_PIPE_PATH,
  DSH_PACKAGE,
  DSH_PROFILE,
  DSH_VERSION,
  DeepSeekBalanceError,
  buildDshPluginCommand,
  inspectDeepSeekPlugin,
  queryDeepSeekBalance,
  resolveDshHome,
  runDshPluginCommand,
  stageDeepSeekBundle
};
