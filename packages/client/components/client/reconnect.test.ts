import { describe, expect, it } from "vitest";

import { reconnectDelay } from "./reconnect";

describe("reconnectDelay", () => {
  it("backs off exponentially", () => {
    expect(reconnectDelay(1, 0.5)).toBe(1);
    expect(reconnectDelay(2, 0.5)).toBe(3);
    expect(reconnectDelay(4, 0.5)).toBe(15);
  });

  it("caps the delay however many attempts have failed", () => {
    expect(reconnectDelay(5, 0.5)).toBe(30);
    expect(reconnectDelay(1000, 0.5)).toBe(30);
  });

  it("applies up to 20% jitter either way", () => {
    expect(reconnectDelay(1000, 0)).toBeCloseTo(24);
    expect(reconnectDelay(1000, 1)).toBeCloseTo(36);
  });
});
