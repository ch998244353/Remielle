function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function characterSizeForScale(baseSize, scale) {
  return {
    width: Math.round(baseSize.width * scale),
    height: Math.round(baseSize.height * scale)
  };
}

function placeBubble(
  characterBounds,
  bubbleSize,
  workArea,
  preferredSide = 'right',
  mirrored = false
) {
  const gap = 4;
  const rightX = characterBounds.x + characterBounds.width + gap;
  const leftX = characterBounds.x - gap - bubbleSize.width;
  const rightEdge = workArea.x + workArea.width;
  const bottomEdge = workArea.y + workArea.height;
  const rightFits = rightX + bubbleSize.width <= rightEdge;
  const leftFits = leftX >= workArea.x;
  const firstSide = preferredSide === 'left' ? 'left' : 'right';
  const secondSide = firstSide === 'right' ? 'left' : 'right';
  const fits = { left: leftFits, right: rightFits };
  const side = fits[firstSide] || !fits[secondSide] ? firstSide : secondSide;
  const oppositeHead = (side === 'left' && mirrored) || (side === 'right' && !mirrored);
  const inwardOffset = oppositeHead ? characterBounds.width / 4 : 0;
  const preferredX = side === 'right'
    ? rightX - inwardOffset
    : leftX + inwardOffset;

  return {
    x: clamp(preferredX, workArea.x, rightEdge - bubbleSize.width),
    y: clamp(characterBounds.y + 24, workArea.y, bottomEdge - bubbleSize.height),
    side
  };
}

function resizeAroundBottomCenter(bounds, newSize, workArea) {
  const position = {
    x: bounds.x + bounds.width / 2 - newSize.width / 2,
    y: bounds.y + bounds.height - newSize.height
  };
  return clampPositionToWorkArea(position, newSize, workArea);
}

function defaultPosition(workArea, windowSize) {
  return {
    x: workArea.x + workArea.width - windowSize.width - 24,
    y: workArea.y + workArea.height - windowSize.height - 24
  };
}

function clampPositionToWorkArea(position, windowSize, workArea) {
  return {
    x: clamp(position.x, workArea.x, workArea.x + workArea.width - windowSize.width),
    y: clamp(position.y, workArea.y, workArea.y + workArea.height - windowSize.height)
  };
}

function dragPositionFromCursor(session, cursor, windowSize, workArea) {
  return clampPositionToWorkArea(
    {
      x: session.windowX + cursor.x - session.pointerX,
      y: session.windowY + cursor.y - session.pointerY
    },
    windowSize,
    workArea
  );
}

function restorePosition(config, workAreas, windowSize) {
  const fallback = defaultPosition(workAreas[0], windowSize);
  if (
    config?.version !== 1 ||
    !Number.isFinite(config.x) ||
    !Number.isFinite(config.y)
  ) {
    return fallback;
  }

  const matchingArea = workAreas.find((area) => (
    config.x < area.x + area.width &&
    config.x + windowSize.width > area.x &&
    config.y < area.y + area.height &&
    config.y + windowSize.height > area.y
  ));
  if (!matchingArea) return fallback;

  return {
    x: clamp(config.x, matchingArea.x, matchingArea.x + matchingArea.width - windowSize.width),
    y: clamp(config.y, matchingArea.y, matchingArea.y + matchingArea.height - windowSize.height)
  };
}

module.exports = {
  characterSizeForScale,
  clampPositionToWorkArea,
  dragPositionFromCursor,
  placeBubble,
  resizeAroundBottomCenter,
  restorePosition
};
