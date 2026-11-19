/** Wait before highlighting, so a scroll that starts on the item doesn't flash it */
const HIGHLIGHT_DELAY = 80;
const MOVE_TOLERANCE = 10;

// Only the innermost item under the finger lights up
const handledEvents = new WeakSet<PointerEvent>();

/**
 * Highlight an item with a long-press menu as soon as a finger rests on it,
 * instead of nothing happening until the menu appears
 * @returns Remove the listeners
 */
export function addPressFeedback(element: HTMLElement) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pointerId = -1;
  let startX = 0;
  let startY = 0;

  function stop() {
    clearTimeout(timer);
    timer = undefined;
    delete element.dataset.pressing;
    document.removeEventListener("pointermove", onMove, true);
    document.removeEventListener("pointerup", stop, true);
    document.removeEventListener("pointercancel", stop, true);
    document.removeEventListener("scroll", stop, true);
  }

  function onMove(event: PointerEvent) {
    if (event.pointerId !== pointerId) return;
    if (
      Math.abs(event.clientX - startX) > MOVE_TOLERANCE ||
      Math.abs(event.clientY - startY) > MOVE_TOLERANCE
    ) {
      stop();
    }
  }

  function onPointerDown(event: PointerEvent) {
    if (event.pointerType !== "touch" || !event.isPrimary) return;
    if (handledEvents.has(event)) return;
    handledEvents.add(event);

    stop();
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    timer = setTimeout(() => (element.dataset.pressing = ""), HIGHLIGHT_DELAY);

    document.addEventListener("pointermove", onMove, true);
    document.addEventListener("pointerup", stop, true);
    document.addEventListener("pointercancel", stop, true);
    document.addEventListener("scroll", stop, true);
  }

  element.addEventListener("pointerdown", onPointerDown);
  // the menu opening ends the press
  element.addEventListener("contextmenu", stop);

  return () => {
    element.removeEventListener("pointerdown", onPointerDown);
    element.removeEventListener("contextmenu", stop);
    stop();
  };
}

/** A short buzz when a long press opens a menu, where supported (Android) */
export function longPressVibrate() {
  try {
    navigator.vibrate?.(10);
  } catch {
    // not allowed without a recent tap on some browsers
  }
}
