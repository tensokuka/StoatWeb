import type { Channel } from "stoat.js";
import { describe, expect, test } from "vitest";

import {
  getPanelBridge,
  isPanelChannel,
  stripPanelMarker,
} from "../../../../components/common/lib/panel";

import { parseManifest } from "./manifest";

const channel = (fields: Partial<Channel>) =>
  ({ type: "TextChannel", isVoice: false, ...fields }) as unknown as Channel;

describe("isPanelChannel", () => {
  test("detects the marker on text channels", () => {
    expect(isPanelChannel(channel({ description: "Lights [panel]" }))).toBe(
      true,
    );
  });

  test("ignores channels without the marker", () => {
    expect(isPanelChannel(channel({ description: "just chat" }))).toBe(false);
    expect(isPanelChannel(channel({}))).toBe(false);
  });

  test("ignores voice and non-server channels", () => {
    expect(
      isPanelChannel(channel({ description: "[panel]", isVoice: true })),
    ).toBe(false);
    expect(
      isPanelChannel(channel({ description: "[panel]", type: "Group" })),
    ).toBe(false);
  });
});

describe("getPanelBridge / stripPanelMarker", () => {
  test("uses an explicit bridge URL and trims trailing slashes", () => {
    expect(getPanelBridge("[panel:https://bridge.lan/]")).toBe(
      "https://bridge.lan",
    );
  });

  test("returns undefined without a marker", () => {
    expect(getPanelBridge("nothing here")).toBeUndefined();
  });

  test("strips the marker for display", () => {
    expect(stripPanelMarker("Media controls [panel:https://b.lan]")).toBe(
      "Media controls",
    );
    expect(stripPanelMarker("[panel]")).toBeUndefined();
  });
});

describe("parseManifest", () => {
  test("parses every widget type and fills defaults", () => {
    const manifest = parseManifest({
      version: 1,
      title: "Media",
      widgets: [
        { type: "button", label: "Go", action: "ha.toggle", w: 3 },
        { type: "status", source: "jellyfin.sessions", refresh: 15 },
        {
          type: "form",
          action: "req",
          fields: [{ name: "title", required: true }],
        },
        { type: "iframe", src: "https://grafana.lan", h: 6 },
        { type: "markdown", content: "hi" },
      ],
    });

    expect(manifest.columns).toBe(12);
    expect(manifest.widgets.map((w) => w.type)).toEqual([
      "button",
      "status",
      "form",
      "iframe",
      "markdown",
    ]);
    expect(manifest.widgets[0]).toMatchObject({ id: "widget-0", w: 3, h: 1 });
    expect(manifest.widgets[1]).toMatchObject({ refresh: 15, w: 12 });
    expect(manifest.widgets[2]).toMatchObject({
      fields: [{ name: "title", kind: "text", required: true }],
    });
  });

  test("clamps widget width to the column count", () => {
    const manifest = parseManifest({
      version: 1,
      columns: 4,
      widgets: [{ type: "markdown", w: 99 }],
    });
    expect(manifest.widgets[0].w).toBe(4);
  });

  test("keeps unknown widget types as a fallback", () => {
    const manifest = parseManifest({
      version: 1,
      widgets: [{ type: "chart" }],
    });
    expect(manifest.widgets[0]).toMatchObject({
      type: "unknown",
      originalType: "chart",
    });
  });

  test("rejects invalid manifests", () => {
    expect(() => parseManifest(null)).toThrow();
    expect(() => parseManifest({ version: 2, widgets: [] })).toThrow(/version/);
    expect(() =>
      parseManifest({ version: 1, widgets: [{ type: "button" }] }),
    ).toThrow(/action/);
    expect(() =>
      parseManifest({
        version: 1,
        widgets: [{ type: "form", action: "x", fields: [{ kind: "date" }] }],
      }),
    ).toThrow(/kind/);
  });
});
