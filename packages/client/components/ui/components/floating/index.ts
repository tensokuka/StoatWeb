export { FloatingManager } from "./FloatingManager";
export { MenuSheet, useMenuSheet } from "./MenuSheet";
export { Tooltip } from "./Tooltip";
export { UserCard } from "./UserCard";

/**
 * Trigger a global pointerdown running the floating close logic
 */
export function dismissFloatingElements() {
  document.dispatchEvent(new Event("pointerdown"));
}
