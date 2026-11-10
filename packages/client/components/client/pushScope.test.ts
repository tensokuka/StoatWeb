import { describe, expect, it } from "vitest";

import {
  normaliseScope,
  pushScopeFor,
  sameScope,
  userIdFromScope,
} from "./pushScope";

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

describe("pushScopeFor", () => {
  it("puts each account's push worker under its own path", () => {
    expect(pushScopeFor("/assets/pushWorker-AbC123.js", "01ABC")).toBe(
      "/assets/push/01ABC/",
    );
  });

  it("stays within the script's directory, as service worker scopes must", () => {
    const script = "/assets/pushWorker-AbC123.js";
    const dir = script.slice(0, script.lastIndexOf("/") + 1);
    expect(pushScopeFor(script, "01ABC").startsWith(dir)).toBe(true);
  });
});

describe("userIdFromScope", () => {
  it("reads the account from a path scope", () => {
    expect(userIdFromScope("https://chat.example.com/assets/push/01ABC/")).toBe(
      "01ABC",
    );
  });

  it("reads the account from the old query scope", () => {
    expect(userIdFromScope("https://chat.example.com/assets/?@01ABC")).toBe(
      "01ABC",
    );
    expect(userIdFromScope("https://chat.example.com/assets/?%4001ABC")).toBe(
      "01ABC",
    );
  });

  it("gives nothing when iOS has dropped the query", () => {
    expect(userIdFromScope("https://chat.example.com/assets/")).toBe("");
  });
});
