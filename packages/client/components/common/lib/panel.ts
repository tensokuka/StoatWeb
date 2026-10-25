import { Channel } from "stoat.js";

import env from "./env";

/**
 * Matches `[panel]` or `[panel:https://bridge.example]` in a channel description
 */
const PANEL_MARKER = /\[panel(?::([^\]\s]+))?\]/i;

/**
 * Whether this channel should be rendered as a panel room
 *
 * Panel rooms are plain text channels marked through their description,
 * so swap this out if the backend ever gains a first-class field
 * @param channel Channel
 */
export function isPanelChannel(channel?: Channel): boolean {
  return (
    channel?.type === "TextChannel" &&
    !channel.isVoice &&
    PANEL_MARKER.test(channel.description ?? "")
  );
}

/**
 * Resolve the bridge base URL for a panel channel
 * @param description Channel description
 * @returns Bridge URL without trailing slash, or undefined if not configured
 */
export function getPanelBridge(description?: string): string | undefined {
  const match = description?.match(PANEL_MARKER);
  if (!match) return undefined;

  const url = match[1] || env.PANEL_BRIDGE_URL;
  return url ? url.replace(/\/+$/, "") : undefined;
}

/**
 * Remove the panel marker from a description for display
 * @param description Channel description
 */
export function stripPanelMarker(description?: string): string | undefined {
  return description?.replace(PANEL_MARKER, "").trim() || undefined;
}

/**
 * Whether an iframe source is on the configured allowlist
 * @param src URL to check
 */
export function isAllowedIframeSrc(src: string): boolean {
  let origin: string;
  try {
    origin = new URL(src).origin;
  } catch {
    return false;
  }

  return (env.PANEL_IFRAME_ORIGINS ?? "")
    .split(",")
    .map((entry) => entry.trim().replace(/\/+$/, ""))
    .filter(Boolean)
    .includes(origin);
}
