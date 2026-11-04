/**
 * Elements which always keep horizontal swipes to themselves.
 * Add `data-no-drawer` to opt out of the drawer swipe.
 */
const GESTURE_OWNERS = 'input[type="range"], mdui-slider, [data-no-drawer]';

/**
 * Ignore rounding differences, which don't give the user anything to scroll
 */
const SCROLL_TOLERANCE = 1;

/**
 * Whether a horizontal swipe belongs to something under the finger, not the drawer
 * @param target Element where the touch started
 * @param root Element the drawer listens on, where the search stops
 * @returns Whether the drawer should leave this swipe alone
 */
export function ownsHorizontalGesture(
  target: EventTarget | null,
  root: Element,
) {
  let element = target instanceof Element ? target : null;

  while (element && element !== root) {
    if (element.matches(GESTURE_OWNERS)) return true;

    const { overflowX, touchAction } = getComputedStyle(element);
    if (touchAction === "none") return true;

    if (
      (overflowX === "auto" || overflowX === "scroll") &&
      element.scrollWidth - element.clientWidth > SCROLL_TOLERANCE
    ) {
      return true;
    }

    element = element.parentElement;
  }

  return false;
}
