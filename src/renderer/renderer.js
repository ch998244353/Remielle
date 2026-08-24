const machine = globalThis.RemielPet.createPetMachine();
const mediaByState = new Map([
  ['idle', document.getElementById('idle')],
  ['click', document.getElementById('click')],
  ['message', document.getElementById('message')],
  ['dragPickup', document.getElementById('dragPickup')],
  ['dragHold', document.getElementById('dragHold')],
  ['dragRelease', document.getElementById('dragRelease')]
]);
const mediaController = globalThis.RemielMedia.createMediaController(mediaByState);
let pointer = null;
let interactionLocked = false;

function renderState() {
  const { state } = machine.getSnapshot();
  document.body.dataset.state = state;
  mediaController.show(state);
}

function finishCurrentMedia(event) {
  const before = machine.getSnapshot().state;
  if (before !== event.currentTarget.id) return;
  machine.send({ type: 'mediaEnded' });
  const after = machine.getSnapshot().state;
  if (after !== before) renderState();
  if (after === 'idle') globalThis.petApi.notifyIdle();
}

for (const media of mediaByState.values()) {
  if (media.tagName === 'VIDEO' && media.id !== 'idle') {
    media.addEventListener('ended', finishCurrentMedia);
  }
}

document.body.addEventListener('pointerdown', (event) => {
  if (
    interactionLocked ||
    event.button !== 0
  ) return;
  event.preventDefault();
  pointer = {
    id: event.pointerId,
    startX: event.screenX,
    startY: event.screenY
  };
  document.body.setPointerCapture(event.pointerId);
  machine.send({ type: 'pointerDown' });
  globalThis.petApi.startDrag(event.screenX, event.screenY);
});

document.body.addEventListener('pointermove', (event) => {
  if (!pointer || event.pointerId !== pointer.id) return;

  const before = machine.getSnapshot();
  machine.send({
    type: 'pointerMove',
    dx: event.screenX - pointer.startX,
    dy: event.screenY - pointer.startY
  });
  const after = machine.getSnapshot();
  if (after.dragging) globalThis.petApi.moveDrag();
  if (after.state !== before.state) renderState();
});

function finishPointer(event, eventType) {
  if (!pointer || event.pointerId !== pointer.id) return;

  const before = machine.getSnapshot();
  machine.send({ type: eventType });
  globalThis.petApi.endDrag();
  pointer = null;
  if (document.body.hasPointerCapture(event.pointerId)) {
    document.body.releasePointerCapture(event.pointerId);
  }
  const after = machine.getSnapshot();
  if (eventType === 'pointerUp' && !before.dragging) {
    globalThis.petApi.hideBubble();
    globalThis.petApi.requestBalance().catch(() => {});
  }
  if (after.state !== before.state) renderState();
  if (after.state === 'idle') globalThis.petApi.notifyIdle();
}

document.body.addEventListener('pointerup', (event) => finishPointer(event, 'pointerUp'));
document.body.addEventListener('pointercancel', (event) => finishPointer(event, 'pointerCancel'));

globalThis.petApi.onAppearance((appearance) => {
  document.body.dataset.mirrored = appearance?.mirrored === true ? 'true' : 'false';
});

globalThis.petApi.onInteractionLocked((locked) => {
  interactionLocked = locked;
  if (!locked || !pointer) return;
  finishPointer({ pointerId: pointer.id }, 'pointerCancel');
});

globalThis.petApi.onNotification((notification) => {
  if (
    typeof notification?.id !== 'string' ||
    typeof notification?.text !== 'string'
  ) return;
  const result = machine.showMessage(notification.text);
  globalThis.petApi.reportNotification(
    notification.id,
    result.accepted ? 'accepted' : result.reason
  );
  if (!result.accepted) return;
  globalThis.petApi.showBubble(result.text);
  if (result.animate) renderState();
});

globalThis.petApi.onMessage((input) => {
  const result = machine.showMessage(input);
  if (!result.accepted) return;
  globalThis.petApi.showBubble(result.text);
  if (result.animate) renderState();
});
renderState();
