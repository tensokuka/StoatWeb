import { size } from "@floating-ui/dom";

/**
 * Floating UI middleware which caps a floating element to the space left
 * in the viewport and lets it scroll, so long menus never run off screen
 *
 * @param padding Space to keep from the viewport edges
 * @param target Element to size and scroll, defaults to the floating element
 */
export function fitToViewport(
  padding = 8,
  target: (floating: HTMLElement) => HTMLElement | null = (floating) =>
    floating,
) {
  return size({
    padding,
    apply({ availableWidth, availableHeight, elements }) {
      const element = target(elements.floating);
      if (!element) return;

      Object.assign(element.style, {
        maxWidth: `${Math.max(0, availableWidth)}px`,
        maxHeight: `${Math.max(0, availableHeight)}px`,
        overflowY: "auto",
        overscrollBehavior: "contain",
      });
    },
  });
}
