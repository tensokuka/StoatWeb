import { createEffect, onCleanup, onMount } from "solid-js";

import { ConnectionState } from "stoat.js";

import { useClient } from ".";
import { ActivityTracker } from "./activity";

const INPUT_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel"];

/**
 * Tells the server whether this device is in use, so push notifications go
 * to the user's other devices while it isn't
 */
export function ActivityReporter() {
  const client = useClient();

  function report(active: boolean) {
    const events = client().events;
    if (events.state() !== ConnectionState.Connected) return;
    try {
      // Not in stoat.js's protocol types, which come from upstream
      events.send({ type: "Activity", active } as never);
    } catch {
      // Sent again on reconnect
    }
  }

  const tracker = new ActivityTracker(
    {
      visible: document.visibilityState === "visible",
      focused: document.hasFocus(),
    },
    report,
  );

  // A new connection starts out counted as in use
  createEffect(() => {
    if (client().events.state() === ConnectionState.Connected) {
      report(tracker.active);
    }
  });

  onMount(() => {
    const onVisibility = () =>
      tracker.update({ visible: document.visibilityState === "visible" });
    const onFocus = () => tracker.update({ focused: true });
    const onBlur = () => tracker.update({ focused: false });
    const onInput = () => tracker.input();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    for (const event of INPUT_EVENTS) {
      window.addEventListener(event, onInput, { passive: true });
    }

    onCleanup(() => {
      tracker.dispose();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
      for (const event of INPUT_EVENTS) {
        window.removeEventListener(event, onInput);
      }
    });
  });

  return null;
}
