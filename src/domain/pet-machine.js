function createPetMachine() {
  let state = 'idle';
  let pointerActive = false;
  let dragging = false;
  let clickEligible = false;
  let dragAnimationEligible = false;

  function getSnapshot() {
    return { state, dragging };
  }

  function showMessage(input) {
    if (typeof input !== 'string') return { accepted: false, reason: 'empty' };
    const normalized = input.trim().replace(/\s+/gu, ' ');
    if (!normalized) return { accepted: false, reason: 'empty' };
    const codePoints = Array.from(normalized);
    const text = codePoints.length > 50
      ? `${codePoints.slice(0, 49).join('')}…`
      : normalized;

    const animate = state === 'idle';
    if (animate) state = 'message';
    return { accepted: true, text, animate };
  }

  function send(event) {
    if (event.type === 'mediaEnded') {
      if (state === 'click' || state === 'message') state = 'idle';
      else if (state === 'dragPickup') state = 'dragHold';
      else if (state === 'dragRelease') state = 'idle';
      return;
    }

    if (event.type === 'pointerDown') {
      pointerActive = true;
      dragging = false;
      clickEligible = state === 'idle';
      dragAnimationEligible = state === 'idle';
      return;
    }

    if (event.type === 'pointerCancel') {
      if (dragging && (state === 'dragPickup' || state === 'dragHold')) {
        state = 'dragRelease';
      }
      pointerActive = false;
      dragging = false;
      clickEligible = false;
      dragAnimationEligible = false;
      return;
    }

    if (event.type === 'pointerMove' && pointerActive) {
      if (!dragging && Math.hypot(event.dx, event.dy) > 6) {
        dragging = true;
        if (dragAnimationEligible && state === 'idle') state = 'dragPickup';
      }
      return;
    }

    if (event.type === 'pointerUp' && pointerActive) {
      const clicked = clickEligible && !dragging && state === 'idle';
      pointerActive = false;
      dragging = false;
      clickEligible = false;
      dragAnimationEligible = false;
      if (state === 'dragPickup' || state === 'dragHold') state = 'dragRelease';
      else if (clicked) state = 'click';
    }
  }

  return { getSnapshot, send, showMessage };
}

const petMachineApi = { createPetMachine };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = petMachineApi;
} else {
  globalThis.RemielPet = petMachineApi;
}
