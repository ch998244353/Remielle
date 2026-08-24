const test = require('node:test');
const assert = require('node:assert/strict');
const { createMediaController } = require('../src/renderer/media-controller.js');

function createVideo(id) {
  const callbacks = [];
  return {
    id,
    hidden: true,
    style: { opacity: '' },
    currentTime: 9,
    playbackRate: 1,
    paused: false,
    playCount: 0,
    pause() {
      this.paused = true;
    },
    play() {
      this.paused = false;
      this.playCount += 1;
      return Promise.resolve();
    },
    requestVideoFrameCallback(callback) {
      callbacks.push(callback);
    },
    commitFrame() {
      callbacks.shift()?.();
    }
  };
}

function createImage(id) {
  return {
    id,
    hidden: true,
    style: { opacity: '' },
    complete: true,
    naturalWidth: 432,
    addEventListener() {}
  };
}

test('目标首帧提交前保留旧画面，单击动作以两倍速切换', () => {
  const idle = createVideo('idle');
  const click = createVideo('click');
  const controller = createMediaController(new Map([
    ['idle', idle],
    ['click', click]
  ]));

  controller.show('idle');
  assert.equal(idle.hidden, false);
  assert.equal(idle.style.opacity, '1');
  idle.commitFrame();
  controller.show('click');

  assert.equal(idle.hidden, false);
  assert.equal(idle.style.opacity, '1');
  assert.equal(click.hidden, false);
  assert.equal(click.style.opacity, '0');
  assert.equal(click.currentTime, 0);
  assert.equal(click.playbackRate, 2);

  click.commitFrame();
  assert.equal(idle.hidden, true);
  assert.equal(click.hidden, false);
  assert.equal(click.style.opacity, '1');
});

test('快速连续切换时过期首帧不能覆盖最新目标', () => {
  const idle = createVideo('idle');
  const click = createVideo('click');
  const message = createVideo('message');
  const controller = createMediaController(new Map([
    ['idle', idle],
    ['click', click],
    ['message', message]
  ]));

  controller.show('idle');
  idle.commitFrame();
  controller.show('click');
  controller.show('message');

  click.commitFrame();
  assert.equal(idle.hidden, false);
  assert.equal(message.style.opacity, '0');

  message.commitFrame();
  assert.equal(idle.hidden, true);
  assert.equal(click.hidden, true);
  assert.equal(message.hidden, false);
  assert.equal(message.style.opacity, '1');
});

test('静态保持帧完成绘制前继续保留旧动作画面', () => {
  const frames = [];
  const idle = createVideo('idle');
  const hold = createImage('dragHold');
  const controller = createMediaController(new Map([
    ['idle', idle],
    ['dragHold', hold]
  ]), (callback) => frames.push(callback));

  controller.show('idle');
  controller.show('dragHold');
  assert.equal(idle.hidden, false);
  assert.equal(idle.style.opacity, '1');
  assert.equal(hold.hidden, false);
  assert.equal(hold.style.opacity, '0');

  frames.shift()();
  assert.equal(idle.hidden, true);
  assert.equal(hold.style.opacity, '1');
});
