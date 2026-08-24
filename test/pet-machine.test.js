const test = require('node:test');
const assert = require('node:assert/strict');
const { createPetMachine } = require('../src/domain/pet-machine.js');

test('非待机动作仍可拖动，动作结束后保持拖动并进入待机', () => {
  const machine = createPetMachine();

  assert.deepEqual(machine.showMessage('第一条消息'), {
    accepted: true,
    text: '第一条消息',
    animate: true
  });
  machine.send({ type: 'pointerDown' });
  machine.send({ type: 'pointerMove', dx: 20, dy: 0 });
  assert.deepEqual(machine.getSnapshot(), { state: 'message', dragging: true });

  machine.send({ type: 'mediaEnded' });
  assert.deepEqual(machine.getSnapshot(), { state: 'idle', dragging: true });

  machine.send({ type: 'pointerUp' });
  assert.deepEqual(machine.getSnapshot(), { state: 'idle', dragging: false });
});

test('待机拖动完整经过拿起、保持、放下并回到待机', () => {
  const machine = createPetMachine();
  machine.send({ type: 'pointerDown' });
  machine.send({ type: 'pointerMove', dx: 6, dy: 1 });
  assert.deepEqual(machine.getSnapshot(), { state: 'dragPickup', dragging: true });

  machine.send({ type: 'mediaEnded' });
  assert.deepEqual(machine.getSnapshot(), { state: 'dragHold', dragging: true });

  machine.send({ type: 'pointerUp' });
  assert.deepEqual(machine.getSnapshot(), { state: 'dragRelease', dragging: false });

  machine.send({ type: 'mediaEnded' });
  assert.deepEqual(machine.getSnapshot(), { state: 'idle', dragging: false });
});

test('6 DIP 内待机松手仍是单击', () => {
  const clickMachine = createPetMachine();
  clickMachine.send({ type: 'pointerDown' });
  clickMachine.send({ type: 'pointerMove', dx: 6, dy: 0 });
  clickMachine.send({ type: 'pointerUp' });
  assert.equal(clickMachine.getSnapshot().state, 'click');
});

test('取消未移动手势不触发动作，取消待机拖动会安全放下', () => {
  const pendingClick = createPetMachine();
  pendingClick.send({ type: 'pointerDown' });
  pendingClick.send({ type: 'pointerCancel' });
  assert.deepEqual(pendingClick.getSnapshot(), { state: 'idle', dragging: false });

  const dragging = createPetMachine();
  dragging.send({ type: 'pointerDown' });
  dragging.send({ type: 'pointerMove', dx: 7, dy: 0 });
  dragging.send({ type: 'pointerCancel' });
  assert.deepEqual(dragging.getSnapshot(), { state: 'dragRelease', dragging: false });
});

test('拿起动画未结束就松手会立即进入放下', () => {
  const machine = createPetMachine();
  machine.send({ type: 'pointerDown' });
  machine.send({ type: 'pointerMove', dx: 7, dy: 0 });
  machine.send({ type: 'pointerUp' });
  assert.deepEqual(machine.getSnapshot(), { state: 'dragRelease', dragging: false });
});

test('锁定动作期间消息只返回气泡文本，不覆盖或排队人物动作', () => {
  const machine = createPetMachine();
  machine.send({ type: 'pointerDown' });
  machine.send({ type: 'pointerMove', dx: 7, dy: 0 });

  assert.deepEqual(machine.showMessage('  保持 拖动  '), {
    accepted: true,
    text: '保持 拖动',
    animate: false
  });
  assert.deepEqual(machine.getSnapshot(), { state: 'dragPickup', dragging: true });

  machine.send({ type: 'pointerUp' });
  machine.send({ type: 'mediaEnded' });
  assert.equal(machine.getSnapshot().state, 'idle');
});

test('非待机单击不打断当前动作，新消息只更新气泡', () => {
  const machine = createPetMachine();
  machine.showMessage('第一条消息');
  assert.deepEqual(machine.showMessage('第二条消息'), {
    accepted: true,
    text: '第二条消息',
    animate: false
  });

  machine.send({ type: 'pointerDown' });
  machine.send({ type: 'pointerUp' });
  assert.deepEqual(machine.getSnapshot(), { state: 'message', dragging: false });
});

test('消息拒绝空输入、合并空白并按 Unicode code point 截为 50 字', () => {
  assert.deepEqual(createPetMachine().showMessage(42), {
    accepted: false,
    reason: 'empty'
  });
  assert.deepEqual(createPetMachine().showMessage(' \n\t '), {
    accepted: false,
    reason: 'empty'
  });
  assert.deepEqual(createPetMachine().showMessage('  你好 \n 世界  '), {
    accepted: true,
    text: '你好 世界',
    animate: true
  });

  const result = createPetMachine().showMessage(`${'😀'.repeat(50)}尾`);
  assert.deepEqual(result, {
    accepted: true,
    text: `${'😀'.repeat(49)}…`,
    animate: true
  });
  assert.equal(Array.from(result.text).length, 50);
});

test('消息结束回到待机，待机单击完整进入点击动作', () => {
  const machine = createPetMachine();
  machine.showMessage('保留这条消息');
  machine.send({ type: 'mediaEnded' });
  assert.deepEqual(machine.getSnapshot(), { state: 'idle', dragging: false });

  machine.send({ type: 'pointerDown' });
  machine.send({ type: 'pointerUp' });
  assert.equal(machine.getSnapshot().state, 'click');
  machine.send({ type: 'mediaEnded' });
  assert.equal(machine.getSnapshot().state, 'idle');
});

test('非待机按下后动作即使提前结束也不会在手势中途补播拿起', () => {
  const machine = createPetMachine();
  machine.showMessage('当前消息');
  machine.send({ type: 'pointerDown' });
  machine.send({ type: 'mediaEnded' });
  machine.send({ type: 'pointerMove', dx: 20, dy: 0 });
  assert.deepEqual(machine.getSnapshot(), { state: 'idle', dragging: true });

  machine.send({ type: 'pointerUp' });
  assert.deepEqual(machine.getSnapshot(), { state: 'idle', dragging: false });
});
