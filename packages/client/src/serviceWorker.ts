/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";

import { openNotificationUrl } from "./notificationClick";

declare let self: ServiceWorkerGlobalScope;

// Notifications raised by the open app on platforms that require a service worker
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (typeof event.notification.data === "string") {
    event.waitUntil(openNotificationUrl(self.clients, event.notification.data));
  }
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

cleanupOutdatedCaches();

/**
 * Pages (W9): HTML is never precached, because each deploy writes its own
 * settings into it and every launch should get the current one. So fetch it
 * from the network as before, keep the last good copy, and fall back to that
 * when offline or the network is too slow, so the app still opens instead of
 * the browser's error page. The app routes on the client, so every page is
 * the same document.
 */
const PAGES_CACHE = "stoat-pages";
const APP_SHELL = "/__app-shell";
const NETWORK_TIMEOUT_MS = 5000;

const OFFLINE_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Stoat</title><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#191919;color:#e6e1e5;
font:16px system-ui,sans-serif;text-align:center;padding:24px;box-sizing:border-box}
button{margin-top:16px;padding:12px 24px;border:0;border-radius:24px;background:#d0bcff;color:#381e72;font:inherit;font-weight:600}
</style></head><body><div><h1 style="font-size:22px">You're offline</h1>
<p>Stoat couldn't connect. Check your connection and try again.</p>
<button onclick="location.reload()">Try again</button></div></body></html>`;

async function fetchPage(request: Request) {
  const cache = await caches.open(PAGES_CACHE);
  const network = fetch(request).then(async (response) => {
    const type = response.headers.get("content-type") ?? "";
    if (response.ok && !response.redirected && type.includes("text/html")) {
      await cache.put(APP_SHELL, response.clone());
    }
    return response;
  });

  // a slow network shouldn't keep the app from opening
  const timeout = new Promise<undefined>((resolve) =>
    setTimeout(() => resolve(undefined), NETWORK_TIMEOUT_MS),
  );

  try {
    const response = await Promise.race([network, timeout]);
    if (response) return response;
    const cached = await cache.match(APP_SHELL);
    return cached ?? (await network);
  } catch {
    return (
      (await cache.match(APP_SHELL)) ??
      new Response(OFFLINE_PAGE, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      })
    );
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (
    request.mode !== "navigate" ||
    request.method !== "GET" ||
    new URL(request.url).origin !== self.location.origin
  ) {
    return;
  }
  event.respondWith(fetchPage(request));
});

// Generate list using mise scripts:locale
// prettier-ignore
const locale_keys = ["af","am","ar-dz","ar-iq","ar-kw","ar-ly","ar-ma","ar-sa","ar-tn","ar","az","be","bg","bi","bm","bn-bd","bn","bo","br","bs","ca","cs","cv","cy","da","de-at","de-ch","de","dv","el","en-au","en-ca","en-gb","en-ie","en-il","en-in","en-nz","en-sg","en-tt","en","eo","es-do","es-mx","es-pr","es-us","es","et","eu","fa","fi","fo","fr-ca","fr-ch","fr","fy","ga","gd","gl","gom-latn","gu","he","hi","hr","ht","hu","hy-am","id","is","it-ch","it","ja","jv","ka","kk","km","kn","ko","ku","ky","lb","lo","lt","lv","me","mi","mk","ml","mn","mr","ms-my","ms","mt","my","nb","ne","nl-be","nl","nn","oc-lnc","pa-in","pl","pt-br","pt","rn","ro","ru","rw","sd","se","si","sk","sl","sq","sr-cyrl","sr","ss","sv-fi","sv","sw","ta","te","tet","tg","th","tk","tl-ph","tlh","tr","tzl","tzm-latn","tzm","ug-cn","uk","ur","uz-latn","uz","vi","x-pseudo","yo","zh-cn","zh-hk","zh-tw","zh"];

precacheAndRoute(
  self.__WB_MANIFEST.filter((entry) => {
    try {
      const url = typeof entry === "string" ? entry : entry.url;
      if (url.includes("-legacy")) return false;

      const fn = url.split("/").pop();
      if (fn) {
        if (fn.endsWith("css") && !isNaN(parseInt(fn.substring(0, 3)))) {
          return false;
        }

        // Don't cache index.html under any circumstances
        if (fn.endsWith(".html")) {
          return false;
        }

        // Don't cache dayjs locales
        for (const key of locale_keys) {
          if (fn.startsWith(`${key}-`)) {
            return false;
          }
        }

        // Don't cache lingui translations
        if (fn.startsWith("messages-")) {
          return false;
        }
      }

      return true;
    } catch {
      return false;
    }
  }),
);
