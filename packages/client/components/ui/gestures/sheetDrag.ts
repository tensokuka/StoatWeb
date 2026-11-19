/** Movement before deciding whether this is a drag or a scroll */
const DECIDE_AFTER = 8;
/** Drag this share of the sheet's height to close it */
const CLOSE_SHARE = 0.3;
/** Or flick down at least this fast, in px per ms */
const CLOSE_VELOCITY = 0.3;
const ANIM_MS = 160;

/**
 * Whether letting go of a sheet dragged down this far, this fast, closes it
 * @param dy Distance dragged down in px
 * @param velocity Speed at release in px per ms, positive downwards
 * @param height Height of the sheet in px
 */
export function shouldCloseSheet(dy: number, velocity: number, height: number) {
  if (dy <= 0) return false;
  if (velocity >= CLOSE_VELOCITY) return true;
  if (velocity <= -CLOSE_VELOCITY) return false;
  return dy >= height * CLOSE_SHARE;
}

/**
 * Drag a bottom sheet down to close it: from the handle, or from anywhere
 * while its content is scrolled to the top
 * @param sheet The sheet, which also scrolls its content
 * @param scrim Background to fade as the sheet goes
 * @param onClose Close the sheet
 * @returns Remove the listeners
 */
export function addSheetDrag(
  sheet: HTMLElement,
  scrim: HTMLElement | undefined,
  onClose: () => void,
) {
  let id = -1;
  let startX = 0;
  let startY = 0;
  let state: "undecided" | "drag" | "ignore" = "ignore";
  let dy = 0;
  let lastY = 0;
  let lastT = 0;
  let velocity = 0;

  function set(offset: number, animate: boolean) {
    const transition = animate ? `${ANIM_MS}ms ease-out` : "";
    sheet.style.transition = transition && `transform ${transition}`;
    sheet.style.transform = offset ? `translateY(${offset}px)` : "";
    if (scrim) {
      scrim.style.transition = transition && `opacity ${transition}`;
      scrim.style.opacity = String(
        1 - Math.min(1, offset / Math.max(1, sheet.offsetHeight)),
      );
    }
  }

  function find(list: TouchList) {
    for (const touch of list) if (touch.identifier === id) return touch;
  }

  function onStart(event: TouchEvent) {
    if (event.touches.length !== 1) {
      state = "ignore";
      return;
    }
    const touch = event.touches[0];
    id = touch.identifier;
    startX = touch.clientX;
    startY = lastY = touch.clientY;
    lastT = event.timeStamp;
    velocity = 0;
    dy = 0;
    state = "undecided";
  }

  function onMove(event: TouchEvent) {
    if (state === "ignore") return;
    const touch = find(event.changedTouches);
    if (!touch) return;

    const dx = touch.clientX - startX;
    dy = touch.clientY - startY;

    if (state === "undecided") {
      if (Math.abs(dx) < DECIDE_AFTER && Math.abs(dy) < DECIDE_AFTER) return;
      // only downwards, and only when there's nothing above to scroll back to
      state =
        dy > 0 && Math.abs(dy) > Math.abs(dx) && sheet.scrollTop <= 0
          ? "drag"
          : "ignore";
      if (state !== "drag") return;
      startY = touch.clientY;
      dy = 0;
    }

    event.preventDefault();
    const dt = event.timeStamp - lastT;
    if (dt > 0) velocity = (touch.clientY - lastY) / dt;
    lastY = touch.clientY;
    lastT = event.timeStamp;
    set(Math.max(0, dy), false);
  }

  function onEnd(event: TouchEvent) {
    if (state !== "drag" || !find(event.changedTouches)) {
      state = "ignore";
      return;
    }
    state = "ignore";

    // a finger that rested before letting go isn't flicking
    if (event.timeStamp - lastT > 100) velocity = 0;

    if (
      event.type === "touchend" &&
      shouldCloseSheet(dy, velocity, sheet.offsetHeight)
    ) {
      set(sheet.offsetHeight, true);
      setTimeout(onClose, ANIM_MS);
    } else {
      set(0, true);
    }
  }

  sheet.addEventListener("touchstart", onStart, { passive: true });
  sheet.addEventListener("touchmove", onMove, { passive: false });
  sheet.addEventListener("touchend", onEnd);
  sheet.addEventListener("touchcancel", onEnd);

  return () => {
    sheet.removeEventListener("touchstart", onStart);
    sheet.removeEventListener("touchmove", onMove);
    sheet.removeEventListener("touchend", onEnd);
    sheet.removeEventListener("touchcancel", onEnd);
  };
}
