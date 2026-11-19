/**
 * Pinch zoom stays on everywhere, for people who need larger text.
 *
 * iOS zooms into any text field under 16px when it's focused, and doesn't
 * zoom back out. `maximum-scale=1` stops that while still allowing pinch
 * zoom there, but Android would honour it and block zooming, so only add it
 * on iOS.
 */
const isIOS =
  /iP(hone|ad|od)/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

if (isIOS) {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (meta && !meta.content.includes("maximum-scale")) {
    meta.content += ", maximum-scale=1";
  }
}
