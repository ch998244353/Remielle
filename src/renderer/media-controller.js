function createMediaController(mediaByState, scheduleFrame) {
  scheduleFrame ||= globalThis.requestAnimationFrame || ((callback) => callback());
  let active = null;
  let revision = 0;

  function hide(media) {
    if (typeof media.pause === 'function') media.pause();
    if ('currentTime' in media) media.currentTime = 0;
    media.hidden = true;
    media.style.opacity = '0';
  }

  function commit(target, token) {
    if (token !== revision) return;
    for (const media of mediaByState.values()) {
      if (media !== target) hide(media);
    }
    target.hidden = false;
    target.style.opacity = '1';
    active = target;
  }

  function show(state) {
    const target = mediaByState.get(state);
    if (!target) return;
    const token = ++revision;

    for (const media of mediaByState.values()) {
      if (media !== active && media !== target) hide(media);
    }
    if (target === active) {
      target.hidden = false;
      target.style.opacity = '1';
      return;
    }

    if (active === null) {
      target.hidden = false;
      target.style.opacity = '1';
      target.currentTime = 0;
      target.playbackRate = state === 'click' ? 2 : 1;
      active = target;
      target.play().catch(() => {});
      return;
    }

    target.hidden = false;
    target.style.opacity = '0';
    if (typeof target.play === 'function') {
      target.currentTime = 0;
      target.playbackRate = state === 'click' ? 2 : 1;
      if (typeof target.requestVideoFrameCallback === 'function') {
        target.requestVideoFrameCallback(() => commit(target, token));
      } else {
        scheduleFrame(() => commit(target, token));
      }
      target.play().catch(() => {});
    } else {
      const commitImage = () => scheduleFrame(() => commit(target, token));
      if (target.complete && target.naturalWidth > 0) commitImage();
      else target.addEventListener('load', commitImage, { once: true });
    }
  }

  return { show };
}

const mediaControllerApi = { createMediaController };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = mediaControllerApi;
} else {
  globalThis.RemielMedia = mediaControllerApi;
}
