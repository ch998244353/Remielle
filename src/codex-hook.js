const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');

const HOOK_EVENTS = Object.freeze([
  'UserPromptSubmit',
  'PreToolUse',
  'PermissionRequest',
  'Stop'
]);
const HOOK_MARKER = '蕾米埃尔桌宠 Codex 通知';
const PIPE_NAME = 'remiel-desktop-pet-codex-v1';
const FORWARDER_FILENAME = 'codex-hook-forwarder.ps1';

class HookConfigError extends Error {
  constructor(message, cause) {
    super(message, { cause });
    this.name = 'HookConfigError';
  }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateHookConfig(config) {
  if (!isObject(config)) throw new HookConfigError('hooks.json 顶层必须是 JSON 对象');
  if (config.hooks === undefined) return config;
  if (!isObject(config.hooks)) throw new HookConfigError('hooks 字段必须是 JSON 对象');

  for (const [eventName, groups] of Object.entries(config.hooks)) {
    if (!Array.isArray(groups)) {
      throw new HookConfigError(`hooks.${eventName} 必须是数组`);
    }
    for (const group of groups) {
      if (!isObject(group) || !Array.isArray(group.hooks)) {
        throw new HookConfigError(`hooks.${eventName} 包含无效 matcher group`);
      }
      if (group.hooks.some((handler) => !isObject(handler))) {
        throw new HookConfigError(`hooks.${eventName} 包含无效 handler`);
      }
    }
  }
  return config;
}

function resolveCodexHome(environment = process.env, homeDirectory = os.homedir()) {
  const configured = environment.CODEX_HOME;
  return typeof configured === 'string' && configured.trim()
    ? path.resolve(configured.trim())
    : path.join(homeDirectory, '.codex');
}

function getHookPaths({ codexHome, userData }) {
  if (!path.isAbsolute(codexHome) || !path.isAbsolute(userData)) {
    throw new TypeError('codexHome and userData must be absolute paths');
  }
  return {
    hooksFile: path.join(codexHome, 'hooks.json'),
    forwarderFile: path.join(userData, FORWARDER_FILENAME)
  };
}

function quoteWindowsArgument(value) {
  if (/["\r\n]/u.test(value)) throw new TypeError('unsupported character in script path');
  return `"${value}"`;
}

function buildHookHandler(forwarderFile) {
  const command = [
    'powershell.exe',
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-WindowStyle Hidden',
    '-ExecutionPolicy Bypass',
    '-File',
    quoteWindowsArgument(forwarderFile)
  ].join(' ');
  return {
    type: 'command',
    command,
    commandWindows: command,
    timeout: 2,
    async: true,
    statusMessage: HOOK_MARKER
  };
}

function buildForwarderScript(pipeName = PIPE_NAME) {
  if (!/^[A-Za-z0-9._-]+$/u.test(pipeName)) throw new TypeError('invalid pipe name');
  return `\uFEFF$ErrorActionPreference = 'SilentlyContinue'
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

function Limit-Text([string] $Value, [int] $Maximum) {
  if ($null -eq $Value) { return '' }
  if ($Value.Length -le $Maximum) { return $Value }
  $Length = $Maximum
  if ($Length -gt 0) {
    $Last = [int][char]$Value[$Length - 1]
    if ($Last -ge 0xD800 -and $Last -le 0xDBFF) { $Length-- }
  }
  return $Value.Substring(0, $Length)
}

function Normalize-Preview([object] $Value, [int] $Maximum) {
  $Text = ([string]$Value -replace '\\s+', ' ').Trim()
  return Limit-Text $Text $Maximum
}

function Safe-Basename([object] $Value) {
  $Text = ([string]$Value).Trim('"', "'") -replace '\\\\', '/'
  $Parts = $Text -split '/'
  $Leaf = $Parts[$Parts.Length - 1] -replace '[^\\p{L}\\p{N}._ -]', ''
  return Limit-Text $Leaf 80
}

function Safe-CommandSummary([object] $ToolInput) {
  $Command = Normalize-Preview $ToolInput.command 2048
  $FirstLine = ($Command -split '[\\r\\n;|&]')[0].Trim()
  if ($FirstLine -match '^npm(?:\\.cmd)?\\s+test(?:\\s|$)') { return '正在运行 npm test' }
  if ($FirstLine -match '^npm(?:\\.cmd)?\\s+run\\s+([A-Za-z0-9:_-]{1,40})(?:\\s|$)') {
    return "正在运行 npm run $($Matches[1])"
  }
  if ($FirstLine -match '^node(?:\\.exe)?\\s+--test(?:\\s|$)') { return '正在运行 node --test' }
  if ($FirstLine -match '^git(?:\\.exe)?\\s+(status|diff|log|show|branch|fetch|pull|push|add|commit|switch|checkout|restore)(?:\\s|$)') {
    return "正在运行 git $($Matches[1])"
  }
  if ($FirstLine -match '^(?:rg|ripgrep)(?:\\.exe)?(?:\\s|$)') { return '正在搜索内容' }
  if ($FirstLine -match '^(node|npm|npx|git|rg|ripgrep|powershell|pwsh|cmd)(?:\\.exe|\\.cmd)?(?:\\s|$)') {
    return "正在运行 $($Matches[1])"
  }
  return '正在运行命令'
}

function Safe-ToolSummary([string] $ToolName, [object] $ToolInput) {
  if ($ToolName -match '^(Bash|exec_command|write_stdin)$') {
    return Safe-CommandSummary $ToolInput
  }
  if ($ToolName -match '^(apply_patch|Edit|Write)$') {
    $Patch = [string]$ToolInput.patch
    if ([string]::IsNullOrWhiteSpace($Patch)) { $Patch = [string]$ToolInput.input }
    $MatchesForFiles = [regex]::Matches($Patch, '(?m)^\\*\\*\\* (?:Add|Update|Delete) File: (.+)$')
    if ($MatchesForFiles.Count -gt 0) {
      $Leaf = Safe-Basename $MatchesForFiles[0].Groups[1].Value
      if ($MatchesForFiles.Count -gt 1) { return "正在修改 $Leaf 等 $($MatchesForFiles.Count) 个文件" }
      if ($Leaf) { return "正在修改 $Leaf" }
    }
    $Leaf = Safe-Basename $ToolInput.file_path
    if (-not $Leaf) { $Leaf = Safe-Basename $ToolInput.path }
    if ($Leaf) { return "正在修改 $Leaf" }
    return '正在修改文件'
  }
  if ($ToolName -match '(?i)codegraph') { return '正在分析代码结构' }
  if ($ToolName -match '(?i)openai.*docs|docs.*openai') { return '正在查询 OpenAI 文档' }
  if ($ToolName -match '(?i)github|(^|__)gh($|__)') { return '正在处理 GitHub 内容' }
  if ($ToolName -match '(?i)search|find|grep|web__run') { return '正在搜索内容' }
  if ($ToolName -match '(?i)read|open|view_image') {
    $Leaf = Safe-Basename $ToolInput.file_path
    if (-not $Leaf) { $Leaf = Safe-Basename $ToolInput.path }
    if ($Leaf) { return "正在读取 $Leaf" }
    return '正在读取内容'
  }
  if ($ToolName -match '^(Agent|spawn_agent|send_message|followup_task)$') { return '正在使用子智能体' }
  return '正在调用工具'
}

try {
  $InputText = [Console]::In.ReadToEnd()
  if ([string]::IsNullOrWhiteSpace($InputText) -or $InputText.Length -gt 262144) {
    throw 'invalid input'
  }
  $InputObject = $InputText | ConvertFrom-Json -ErrorAction Stop
  $EventName = [string]$InputObject.hook_event_name
  $AllowedEvents = @('UserPromptSubmit', 'PreToolUse', 'PermissionRequest', 'Stop')
  if ($AllowedEvents -notcontains $EventName) { throw 'unknown event' }

  $SessionId = Limit-Text ([string]$InputObject.session_id) 128
  $TurnId = Limit-Text ([string]$InputObject.turn_id) 128
  if ([string]::IsNullOrWhiteSpace($SessionId) -or [string]::IsNullOrWhiteSpace($TurnId)) {
    throw 'missing ids'
  }

  $Message = [ordered]@{
    version = 1
    sessionId = $SessionId
    turnId = $TurnId
    event = $EventName
    sentAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  }
  if ($EventName -eq 'PreToolUse' -or $EventName -eq 'PermissionRequest') {
    $Message.toolName = Limit-Text ([string]$InputObject.tool_name) 128
    $Detail = Safe-ToolSummary $Message.toolName $InputObject.tool_input
    if ($EventName -eq 'PermissionRequest') {
      $Detail = '等待确认：' + ($Detail -replace '^正在', '')
    }
    $Message.detailText = Limit-Text $Detail 256
  }
  if ($EventName -eq 'UserPromptSubmit') {
    $Message.detailText = Limit-Text ('新任务：' + (Normalize-Preview $InputObject.prompt 247)) 256
  }
  if ($EventName -eq 'Stop') {
    $Message.finalText = Normalize-Preview $InputObject.last_assistant_message 256
  }

  $Json = $Message | ConvertTo-Json -Compress -Depth 3
  $Bytes = [Text.Encoding]::UTF8.GetBytes($Json + "\`n")
  if ($Bytes.Length -gt 8192) { throw 'message too large' }

  $Pipe = [System.IO.Pipes.NamedPipeClientStream]::new(
    '.',
    '${pipeName}',
    [System.IO.Pipes.PipeDirection]::Out,
    [System.IO.Pipes.PipeOptions]::Asynchronous
  )
  try {
    $Pipe.Connect(150)
    $Pipe.Write($Bytes, 0, $Bytes.Length)
    $Pipe.Flush()
  } finally {
    $Pipe.Dispose()
  }
} catch {
}

[Console]::Out.Write('{}')
exit 0
`;
}

function isOwnHandler(handler) {
  return isObject(handler) && handler.statusMessage === HOOK_MARKER;
}

function removeOwnHandlers(config) {
  const next = JSON.parse(JSON.stringify(config));
  if (!isObject(next.hooks)) return { changed: false, config: next };
  let changed = false;

  for (const [eventName, groups] of Object.entries(next.hooks)) {
    const keptGroups = [];
    for (const group of groups) {
      const handlers = group.hooks.filter((handler) => !isOwnHandler(handler));
      if (handlers.length !== group.hooks.length) changed = true;
      if (handlers.length > 0) keptGroups.push({ ...group, hooks: handlers });
    }
    if (keptGroups.length > 0) next.hooks[eventName] = keptGroups;
    else delete next.hooks[eventName];
  }
  if (Object.keys(next.hooks).length === 0) delete next.hooks;
  return { changed, config: next };
}

function countOwnHandlers(config) {
  if (!isObject(config.hooks)) return 0;
  return Object.values(config.hooks).reduce((total, groups) => (
    total + groups.reduce((groupTotal, group) => (
      groupTotal + group.hooks.filter(isOwnHandler).length
    ), 0)
  ), 0);
}

function hasExpectedHandlers(config, handler) {
  return HOOK_EVENTS.every((eventName) => {
    const own = (config.hooks?.[eventName] || [])
      .flatMap((group) => group.hooks)
      .filter(isOwnHandler);
    return own.length === 1 && JSON.stringify(own[0]) === JSON.stringify(handler);
  }) && countOwnHandlers(config) === HOOK_EVENTS.length;
}

async function readHookConfig(hooksFile) {
  let raw;
  try {
    raw = await fs.readFile(hooksFile, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return { config: {}, exists: false, raw: null };
    throw error;
  }
  try {
    return { config: validateHookConfig(JSON.parse(raw)), exists: true, raw };
  } catch (error) {
    if (error instanceof HookConfigError) throw error;
    throw new HookConfigError('hooks.json 不是有效 JSON，已拒绝覆盖', error);
  }
}

async function atomicWrite(file, contents) {
  const directory = path.dirname(file);
  const temporaryFile = path.join(
    directory,
    `.${path.basename(file)}.${process.pid}.${randomUUID()}.tmp`
  );
  await fs.mkdir(directory, { recursive: true });
  try {
    await fs.writeFile(temporaryFile, contents, { encoding: 'utf8', flag: 'wx' });
    await fs.rename(temporaryFile, file);
  } finally {
    await fs.rm(temporaryFile, { force: true });
  }
}

async function backupExistingFile(file) {
  const timestamp = new Date().toISOString().replace(/[:.]/gu, '-');
  const backupFile = `${file}.remiel-backup-${timestamp}-${randomUUID()}`;
  await fs.copyFile(file, backupFile, fs.constants.COPYFILE_EXCL);
  return backupFile;
}

async function installCodexHooks({ codexHome, userData, pipeName = PIPE_NAME }) {
  const paths = getHookPaths({ codexHome, userData });
  const current = await readHookConfig(paths.hooksFile);
  const script = buildForwarderScript(pipeName);
  const handler = buildHookHandler(paths.forwarderFile);
  const withoutOwn = removeOwnHandlers(current.config).config;
  const next = withoutOwn;
  if (!isObject(next.hooks)) next.hooks = {};
  for (const eventName of HOOK_EVENTS) {
    if (!Array.isArray(next.hooks[eventName])) next.hooks[eventName] = [];
    next.hooks[eventName].push({ hooks: [{ ...handler }] });
  }

  let scriptChanged = true;
  try {
    scriptChanged = await fs.readFile(paths.forwarderFile, 'utf8') !== script;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (scriptChanged) await atomicWrite(paths.forwarderFile, script);

  const configChanged = JSON.stringify(current.config) !== JSON.stringify(next);
  let backupFile = null;
  if (configChanged) {
    if (current.exists) backupFile = await backupExistingFile(paths.hooksFile);
    await atomicWrite(paths.hooksFile, `${JSON.stringify(next, null, 2)}\n`);
  }
  return { ...paths, backupFile, changed: scriptChanged || configChanged };
}

async function uninstallCodexHooks({ codexHome, userData }) {
  const paths = getHookPaths({ codexHome, userData });
  const current = await readHookConfig(paths.hooksFile);
  const removed = removeOwnHandlers(current.config);
  let backupFile = null;
  if (removed.changed) {
    backupFile = await backupExistingFile(paths.hooksFile);
    await atomicWrite(paths.hooksFile, `${JSON.stringify(removed.config, null, 2)}\n`);
  }
  let scriptRemoved = false;
  try {
    await fs.rm(paths.forwarderFile);
    scriptRemoved = true;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return { ...paths, backupFile, changed: removed.changed || scriptRemoved };
}

async function inspectCodexHooks({ codexHome, userData, pipeName = PIPE_NAME }) {
  const paths = getHookPaths({ codexHome, userData });
  let current;
  try {
    current = await readHookConfig(paths.hooksFile);
  } catch (error) {
    if (error instanceof HookConfigError) return { ...paths, state: 'invalid', error };
    throw error;
  }
  const handler = buildHookHandler(paths.forwarderFile);
  const ownCount = countOwnHandlers(current.config);
  let scriptCurrent = false;
  try {
    scriptCurrent = await fs.readFile(paths.forwarderFile, 'utf8') === buildForwarderScript(pipeName);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (ownCount === 0 && !scriptCurrent) return { ...paths, state: 'disabled' };
  return {
    ...paths,
    state: hasExpectedHandlers(current.config, handler) && scriptCurrent
      ? 'enabled'
      : 'needsRepair'
  };
}

module.exports = {
  FORWARDER_FILENAME,
  HOOK_EVENTS,
  HOOK_MARKER,
  HookConfigError,
  PIPE_NAME,
  buildForwarderScript,
  buildHookHandler,
  inspectCodexHooks,
  installCodexHooks,
  removeOwnHandlers,
  resolveCodexHome,
  uninstallCodexHooks,
  validateHookConfig
};
