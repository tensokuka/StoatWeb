import { describe, expect, it } from "vitest";

import { sharedText } from "./sharedText";

describe("sharedText", () => {
  it("joins title, text and link", () => {
    expect(
      sharedText(
        new URLSearchParams({
          title: "A post",
          text: "Look",
          url: "https://x.y",
        }),
      ),
    ).toBe("A post\nLook\nhttps://x.y");
  });

  it("drops a link already in the text", () => {
    expect(
      sharedText(
        new URLSearchParams({
          text: "Look at https://x.y",
          url: "https://x.y",
        }),
      ),
    ).toBe("Look at https://x.y");
  });

  it("is empty when nothing was shared", () => {
    expect(sharedText(new URLSearchParams())).toBe("");
  });
});
