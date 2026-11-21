import { createSignal } from "solid-js";

/**
 * The server whose channel list is in reorder mode, if any. Touchscreens
 * can't drag rows without getting in the way of scrolling and long press,
 * so they drag by handles shown only in this mode.
 */
const [reorderingServer, setReorderingServer] = createSignal<string>();

export { reorderingServer, setReorderingServer };
