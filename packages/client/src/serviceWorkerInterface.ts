import { createSignal } from "solid-js";

import { registerSW } from "virtual:pwa-register";

/**
 * Set when a new version has installed and is waiting: call it to switch
 * to it, which reloads the page
 */
const [pendingUpdate, setPendingUpdate] = createSignal<() => void>();

export { pendingUpdate };

/** Least time between update checks */
const CHECK_EVERY_MS = 10 * 60 * 1000;

const updateSW = registerSW({
  onNeedRefresh() {
    setPendingUpdate(() => () => void updateSW(true));
  },
  onOfflineReady() {
    console.info("Ready to work offline =)");
  },
  onRegistered(registration) {
    if (!registration) return;

    let lastCheck = Date.now();
    const check = () => {
      if (Date.now() - lastCheck < CHECK_EVERY_MS) return;
      lastCheck = Date.now();
      registration.update().catch(() => {});
    };

    // An installed app can sit in the background for days, so check when
    // it comes back as well as every hour
    setInterval(check, 36e5);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") check();
    });
  },
});
