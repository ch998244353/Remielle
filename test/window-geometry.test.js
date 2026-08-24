const test = require('node:test');
const assert = require('node:assert/strict');
const {
  characterSizeForScale,
  clampPositionToWorkArea,
  dragPositionFromCursor,
  placeBubble,
  resizeAroundBottomCenter,
  restorePosition
} = require('../src/domain/window-geometry.js');

test('气泡按人物头部远近内移，空间不足自动换边并限制在工作区', () => {
  const workArea = { x: 0, y: 0, width: 1920, height: 1080 };
  const bubbleSize = { width: 328, height: 160 };

  assert.deepEqual(
    placeBubble({ x: 100, y: 100, width: 432, height: 300 }, bubbleSize, workArea),
    { x: 428, y: 124, side: 'right' }
  );
  assert.deepEqual(
    placeBubble({ x: 1500, y: -100, width: 432, height: 300 }, bubbleSize, workArea),
    { x: 1168, y: 0, side: 'left' }
  );
  assert.deepEqual(
    placeBubble({ x: 1500, y: 1000, width: 432, height: 300 }, bubbleSize, workArea),
    { x: 1168, y: 920, side: 'left' }
  );
  assert.deepEqual(
    placeBubble(
      { x: 100, y: 100, width: 432, height: 300 },
      bubbleSize,
      workArea,
      'left',
      false
    ),
    { x: 428, y: 124, side: 'right' }
  );
  assert.deepEqual(
    placeBubble(
      { x: 1000, y: 100, width: 432, height: 300 },
      bubbleSize,
      workArea,
      'left',
      false
    ),
    { x: 668, y: 124, side: 'left' }
  );

  const character = { x: 700, y: 100, width: 432, height: 300 };
  assert.deepEqual(
    placeBubble(character, bubbleSize, workArea, 'left', true),
    { x: 476, y: 124, side: 'left' }
  );
  assert.deepEqual(
    placeBubble(character, bubbleSize, workArea, 'right', true),
    { x: 1136, y: 124, side: 'right' }
  );
  assert.deepEqual(
    placeBubble(character, bubbleSize, workArea, 'left', false),
    { x: 368, y: 124, side: 'left' }
  );
  assert.deepEqual(
    placeBubble(character, bubbleSize, workArea, 'right', false),
    { x: 1028, y: 124, side: 'right' }
  );
  assert.deepEqual(
    placeBubble(
      { x: 400, y: 100, width: 216, height: 150 },
      { width: 164, height: 80 },
      workArea,
      'right',
      false
    ),
    { x: 566, y: 124, side: 'right' }
  );
});

test('五档人物尺寸准确，缩放保持脚底中心并在工作区校正', () => {
  const base = { width: 432, height: 300 };
  assert.deepEqual(characterSizeForScale(base, 0.5), { width: 216, height: 150 });
  assert.deepEqual(characterSizeForScale(base, 1), { width: 432, height: 300 });
  assert.deepEqual(characterSizeForScale(base, 1.5), { width: 648, height: 450 });

  assert.deepEqual(
    resizeAroundBottomCenter(
      { x: 500, y: 400, width: 432, height: 300 },
      { width: 648, height: 450 },
      { x: 0, y: 0, width: 1920, height: 1080 }
    ),
    { x: 392, y: 250 }
  );
  assert.deepEqual(
    resizeAroundBottomCenter(
      { x: 1500, y: 700, width: 432, height: 300 },
      { width: 648, height: 450 },
      { x: 0, y: 0, width: 1920, height: 1080 }
    ),
    { x: 1272, y: 550 }
  );
});

test('损坏、非数字和完全屏外的位置回到主屏，副屏内坐标保持可见', () => {
  const workAreas = [
    { x: 0, y: 0, width: 1920, height: 1080 },
    { x: -1280, y: 0, width: 1280, height: 1024 }
  ];
  const size = { width: 432, height: 300 };
  const fallback = { x: 1464, y: 756 };

  assert.deepEqual(restorePosition(null, workAreas, size), fallback);
  assert.deepEqual(restorePosition({ version: 1, x: '坏', y: 10 }, workAreas, size), fallback);
  assert.deepEqual(restorePosition({ version: 1, x: 9000, y: 9000 }, workAreas, size), fallback);
  assert.deepEqual(
    restorePosition({ version: 1, x: -1000, y: 100 }, workAreas, size),
    { x: -1000, y: 100 }
  );
});

test('拖动位置限制在鼠标所在显示器的工作区内', () => {
  assert.deepEqual(
    clampPositionToWorkArea(
      { x: -200, y: 1000 },
      { width: 432, height: 300 },
      { x: 0, y: 0, width: 1920, height: 1080 }
    ),
    { x: 0, y: 780 }
  );
  assert.deepEqual(
    clampPositionToWorkArea(
      { x: -1500, y: -50 },
      { width: 432, height: 300 },
      { x: -1280, y: 0, width: 1280, height: 1024 }
    ),
    { x: -1280, y: 0 }
  );
});

test('拖动只使用与 Electron 窗口同坐标系的当前光标绝对坐标', () => {
  const session = {
    pointerX: 1000,
    pointerY: 600,
    windowX: 900,
    windowY: 400
  };

  assert.deepEqual(
    dragPositionFromCursor(
      session,
      { x: 1120, y: 564 },
      { width: 432, height: 300 },
      { x: 0, y: 0, width: 1920, height: 1080 }
    ),
    { x: 1020, y: 364 }
  );
});
