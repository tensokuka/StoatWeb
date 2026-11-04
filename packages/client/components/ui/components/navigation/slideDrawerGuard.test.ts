// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { ownsHorizontalGesture } from "./slideDrawerGuard";

/**
 * Give an element fake scroll measurements, since jsdom has no layout
 */
function setWidths(element: Element, scrollWidth: number, clientWidth: number) {
  Object.defineProperty(element, "scrollWidth", { value: scrollWidth });
  Object.defineProperty(element, "clientWidth", { value: clientWidth });
}

describe("ownsHorizontalGesture", () => {
  let root: HTMLElement;
  let parent: HTMLElement;
  let child: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML =
      '<div id="root"><div id="parent"><span id="child"></span></div></div>';
    root = document.getElementById("root")!;
    parent = document.getElementById("parent")!;
    child = document.getElementById("child")!;
  });

  it("lets the drawer handle ordinary content", () => {
    expect(ownsHorizontalGesture(child, root)).toBe(false);
  });

  it("protects scroll areas with something to scroll", () => {
    parent.style.overflowX = "auto";
    setWidths(parent, 600, 300);
    expect(ownsHorizontalGesture(child, root)).toBe(true);
  });

  it("ignores scroll areas with nothing to scroll", () => {
    parent.style.overflowX = "auto";
    setWidths(parent, 300, 300);
    expect(ownsHorizontalGesture(child, root)).toBe(false);
  });

  it("ignores scroll areas that only overflow by rounding", () => {
    parent.style.overflowX = "auto";
    setWidths(parent, 301, 300);
    expect(ownsHorizontalGesture(child, root)).toBe(false);
  });

  it("ignores clipped content which can't be scrolled", () => {
    parent.style.overflowX = "hidden";
    setWidths(parent, 600, 300);
    expect(ownsHorizontalGesture(child, root)).toBe(false);
  });

  it("protects sliders", () => {
    parent.innerHTML = '<mdui-slider id="slider"></mdui-slider>';
    expect(ownsHorizontalGesture(document.getElementById("slider"), root)).toBe(
      true,
    );
  });

  it("respects the opt-out attribute on an ancestor", () => {
    parent.setAttribute("data-no-drawer", "");
    expect(ownsHorizontalGesture(child, root)).toBe(true);
  });

  it("does not look past the root", () => {
    root.setAttribute("data-no-drawer", "");
    expect(ownsHorizontalGesture(child, root)).toBe(false);
  });

  it("handles a missing target", () => {
    expect(ownsHorizontalGesture(null, root)).toBe(false);
  });
});
