import { describe, expect, it } from "vitest";

import { shouldCloseSheet } from "./sheetDrag";

describe("shouldCloseSheet", () => {
  it("closes after dragging a third of the way down", () => {
    expect(shouldCloseSheet(150, 0, 400)).toBe(true);
    expect(shouldCloseSheet(80, 0, 400)).toBe(false);
  });

  it("closes on a quick flick, even a short one", () => {
    expect(shouldCloseSheet(30, 0.8, 400)).toBe(true);
  });

  it("stays open when flicked back up", () => {
    expect(shouldCloseSheet(200, -0.8, 400)).toBe(false);
  });

  it("stays open when not dragged down", () => {
    expect(shouldCloseSheet(0, 1, 400)).toBe(false);
  });
});
