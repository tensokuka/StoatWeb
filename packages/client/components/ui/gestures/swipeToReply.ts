import { claimTouch } from "../components/navigation/slideDrawerGuard";

/** Movement before deciding whether this is a swipe or a scroll */
const DECIDE_AFTER = 10;
/** How far to drag before letting go replies */
export const REPLY_AT = 56;
/** Furthest the message follows the finger */
const MAX_DRAG = 80;

export type SwipeDecision = "undecided" | "swipe" | "ignore";

/**
 * Whether a touch that has moved this far is a swipe to the left (reply),
 * or something else: a scroll, or a swipe right back to the channel list
 */
export function decideSwipe(dx: number, dy: number): SwipeDecision {
  if (Math.abs(dx) < DECIDE_AFTER && Math.abs(dy) < DECIDE_AFTER) {
    return "undecided";
  }
  return dx < 0 && Math.abs(dx) > Math.abs(dy) * 1.5 ? "swipe" : "ignore";
}

/** How far the message follows the finger, slowing down near the end */
export function dragOffset(dx: number) {
  const pull = Math.max(0, -dx);
  return -Math.min(
    MAX_DRAG,
    pull < REPLY_AT ? pull : REPLY_AT + (pull - REPLY_AT) / 3,
  );
}

/**
 * Swipe a message left to reply to it
 * @returns Remove the listeners
 */
export function addSwipeToReply(element: HTMLElement, onReply: () => void) {
  let id = -1;
  let startX = 0;
  let startY = 0;
  let state: SwipeDecision = "ignore";
  let offset = 0;
  let release: (() => void) | undefined;

  function set(offset: number, animate: boolean) {
    element.style.transition = animate ? "transform 0.18s ease-out" : "";
    element.style.transform = offset ? `translateX(${offset}px)` : "";
    element.style.setProperty(
      "--swipe-progress",
      String(Math.min(1, -offset / REPLY_AT)),
    );
  }

  function onStart(event: TouchEvent) {
    if (event.touches.length !== 1) {
      state = "ignore";
      return;
    }
    const touch = event.touches[0];
    id = touch.identifier;
    startX = touch.clientX;
    startY = touch.clientY;
    state = "undecided";
    offset = 0;
  }

  function find(list: TouchList) {
    for (const touch of list) if (touch.identifier === id) return touch;
  }

  function onMove(event: TouchEvent) {
    if (state === "ignore") return;
    const touch = find(event.changedTouches);
    if (!touch) return;

    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;

    if (state === "undecided") {
      state = decideSwipe(dx, dy);
      if (state !== "swipe") return;
      release = claimTouch(id);
      element.dataset.swipeReply = "";
      // a long press shouldn't open the menu mid-swipe
      document.dispatchEvent(new Event("scroll"));
    }

    event.preventDefault();
    offset = dragOffset(dx);
    set(offset, false);
  }

  function onEnd(event: TouchEvent) {
    if (state !== "swipe" || !find(event.changedTouches)) {
      if (state === "undecided") state = "ignore";
      return;
    }
    state = "ignore";
    release?.();
    release = undefined;

    if (offset <= -REPLY_AT && event.type === "touchend") {
      try {
        navigator.vibrate?.(10);
      } catch {
        // not allowed here
      }
      onReply();
    }

    set(0, true);
    setTimeout(() => {
      if (state !== "swipe") delete element.dataset.swipeReply;
    }, 200);
  }

  element.addEventListener("touchstart", onStart, { passive: true });
  element.addEventListener("touchmove", onMove, { passive: false });
  element.addEventListener("touchend", onEnd);
  element.addEventListener("touchcancel", onEnd);

  return () => {
    element.removeEventListener("touchstart", onStart);
    element.removeEventListener("touchmove", onMove);
    element.removeEventListener("touchend", onEnd);
    element.removeEventListener("touchcancel", onEnd);
    release?.();
    set(0, false);
  };
}
