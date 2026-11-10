import { describe, expect, it } from "vitest";

import { normaliseScope, sameScope } from "./pushScope";

const origin = "https://chat.example.com";

describe("sameScope", () => {
  it("matches a registration scope against the relative scope it was made with", () => {
    expect(
      sameScope(
        "https://chat.example.com/assets/?@01ABC",
        "/assets/?@01ABC",
        origin,
      ),
    ).toBe(true);
  });

  it("matches when the browser percent-encodes the scope", () => {
    expect(
      sameScope(
        "https://chat.example.com/assets/?%4001ABC",
        "/assets/?@01ABC",
        origin,
      ),
    ).toBe(true);
  });

  it("does not match another user's scope", () => {
    expect(sameScope("/assets/?@01XYZ", "/assets/?@01ABC", origin)).toBe(false);
  });

  it("does not match the root worker", () => {
    expect(
      sameScope("https://chat.example.com/", "/assets/?@01ABC", origin),
    ).toBe(false);
  });
});

describe("normaliseScope", () => {
  it("keeps malformed escapes rather than throwing", () => {
    expect(normaliseScope("/assets/?@%E0%A4%A", origin)).toBe(
      "/assets/?@%E0%A4%A",
    );
  });
});
