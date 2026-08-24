const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const VALID_SCALES = Object.freeze([0.5, 0.75, 1, 1.25, 1.5]);
const pendingWrites = new Map();

function normalizePreferences(config) {
  return {
    scale: VALID_SCALES.includes(config?.scale) ? config.scale : 1,
    bubbleScale: VALID_SCALES.includes(config?.bubbleScale) ? config.bubbleScale : 1,
    mirrored: typeof config?.mirrored === 'boolean' ? config.mirrored : false,
    bubbleSide: config?.bubbleSide === 'left' || config?.bubbleSide === 'right'
      ? config.bubbleSide
      : 'right',
    balanceSource: config?.balanceSource === 'deepseek' ? 'deepseek' : 'codex',
    monitorCodex: typeof config?.monitorCodex === 'boolean' ? config.monitorCodex : true,
    monitorDeepSeek: typeof config?.monitorDeepSeek === 'boolean' ? config.monitorDeepSeek : true
  };
}

async function loadPosition(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

async function savePosition(file, position) {
  if (!Number.isFinite(position?.x) || !Number.isFinite(position?.y)) {
    throw new TypeError('position must contain finite x and y values');
  }

  const preferences = normalizePreferences(position);
  const data = `${JSON.stringify({
    version: 1,
    x: Math.round(position.x),
    y: Math.round(position.y),
    ...preferences
  }, null, 2)}\n`;
  const previous = pendingWrites.get(file) || Promise.resolve();
  const operation = previous.catch(() => {}).then(async () => {
    const directory = path.dirname(file);
    const temporaryFile = path.join(
      directory,
      `.${path.basename(file)}.${process.pid}.${randomUUID()}.tmp`
    );
    await fs.mkdir(directory, { recursive: true });
    try {
      await fs.writeFile(temporaryFile, data, { encoding: 'utf8', flag: 'wx' });
      await fs.rename(temporaryFile, file);
    } finally {
      await fs.rm(temporaryFile, { force: true });
    }
  });
  pendingWrites.set(file, operation);
  try {
    await operation;
  } finally {
    if (pendingWrites.get(file) === operation) pendingWrites.delete(file);
  }
}

module.exports = { VALID_SCALES, loadPosition, normalizePreferences, savePosition };
