import { describe, expect, it } from "vitest";

import { REPLY_AT, decideSwipe, dragOffset } from "./swipeToReply";

describe("decideSwipe", () => {
  it("waits until the finger has moved a little", () => {
    expect(decideSwipe(-5, 2)).toBe("undecided");
  });

  it("takes clear swipes to the left", () => {
    expect(decideSwipe(-20, 3)).toBe("swipe");
  });

  it("leaves scrolls and diagonal moves alone", () => {
    expect(decideSwipe(-3, 20)).toBe("ignore");
    expect(decideSwipe(-15, 12)).toBe("ignore");
  });

  it("leaves swipes to the right to the channel list drawer", () => {
    expect(decideSwipe(30, 0)).toBe("ignore");
  });
});

describe("dragOffset", () => {
  it("follows the finger up to the reply point", () => {
    expect(dragOffset(-30)).toBe(-30);
    expect(dragOffset(-REPLY_AT)).toBe(-REPLY_AT);
  });

  it("slows down past it, and stops", () => {
    expect(dragOffset(-REPLY_AT - 30)).toBe(-REPLY_AT - 10);
    expect(dragOffset(-500)).toBe(-80);
  });

  it("doesn't move right", () => {
    expect(Object.is(dragOffset(40), -0) || dragOffset(40) === 0).toBe(true);
  });
});
