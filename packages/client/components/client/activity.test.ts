import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ActivityTracker, IDLE_AFTER_MS } from "./activity";

describe("ActivityTracker", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function tracker(visible = true, focused = true) {
    const changes: boolean[] = [];
    const t = new ActivityTracker({ visible, focused }, (a) => changes.push(a));
    return { t, changes };
  }

  it("is active when visible and focused", () => {
    expect(tracker().t.active).toBe(true);
    expect(tracker(false, true).t.active).toBe(false);
    expect(tracker(true, false).t.active).toBe(false);
  });

  it("goes idle as soon as the app is hidden or loses focus", () => {
    const { t, changes } = tracker();
    t.update({ visible: false });
    expect(changes).toEqual([false]);
    t.update({ visible: true });
    t.update({ focused: false });
    expect(changes).toEqual([false, true, false]);
  });

  it("goes idle after five minutes without input", () => {
    const { t, changes } = tracker();
    vi.advanceTimersByTime(IDLE_AFTER_MS - 1);
    expect(t.active).toBe(true);
    vi.advanceTimersByTime(1);
    expect(changes).toEqual([false]);

    t.input();
    expect(changes).toEqual([false, true]);
  });

  it("restarts the five minutes on input", () => {
    const { t, changes } = tracker();
    vi.advanceTimersByTime(IDLE_AFTER_MS - 1000);
    t.input();
    vi.advanceTimersByTime(IDLE_AFTER_MS - 1000);
    expect(changes).toEqual([]);
    vi.advanceTimersByTime(1000);
    expect(changes).toEqual([false]);
  });

  it("counts returning to the app as input", () => {
    const { t, changes } = tracker();
    t.update({ visible: false });
    vi.advanceTimersByTime(IDLE_AFTER_MS * 2);
    t.update({ visible: true });
    expect(changes).toEqual([false, true]);
  });

  it("doesn't report while idle and hidden", () => {
    const { t, changes } = tracker(false, false);
    t.input();
    vi.advanceTimersByTime(IDLE_AFTER_MS * 2);
    expect(changes).toEqual([]);
  });
});
