import { createEffect, createMemo, on, onCleanup } from "solid-js";

import type { Client } from "stoat.js";

import { useState } from "@revolt/state";

import { setAppBadge } from "../../src/appBadge";

import { useClient } from ".";

/**
 * Close notifications for channels that have since been read, here or on
 * another device. Pushes and the app's own notifications are tagged with
 * their channel's id.
 */
async function clearReadNotifications(client: Client) {
  if (!("serviceWorker" in navigator)) return;
  try {
    for (const registration of await navigator.serviceWorker.getRegistrations()) {
      for (const notification of await registration.getNotifications()) {
        const channel =
          notification.tag && client.channels.get(notification.tag);
        if (channel && !channel.unread && !channel.mentions?.size) {
          notification.close();
        }
      }
    }
  } catch {
    // getNotifications isn't available everywhere
  }
}

/**
 * Keeps the app icon's unread badge in step: mentions, plus unread direct
 * messages and groups, leaving out muted channels. Also clears notifications
 * once they've been read.
 */
export function AppBadge() {
  const client = useClient();
  const state = useState();

  const unread = createMemo(() => {
    if (!client().ready()) return;

    let count = 0;
    const ids: string[] = [];
    for (const channel of client().channels.values()) {
      if (channel.type === "SavedMessages") continue;
      if (state.notifications.isMuted(channel)) continue;

      const mentions = channel.mentions?.size ?? 0;
      const directUnread =
        (channel.type === "DirectMessage" || channel.type === "Group") &&
        channel.unread;

      if (mentions) count += mentions;
      else if (directUnread) count += 1;
      if (mentions || channel.unread) ids.push(channel.id);
    }

    return { count, ids: ids.sort().join() };
  });

  createEffect(() => {
    const value = unread();
    if (value) void setAppBadge(value.count);
  });

  // only when the set of unread channels changes
  createEffect(
    on(
      () => unread()?.ids,
      (ids) => {
        if (ids !== undefined) void clearReadNotifications(client());
      },
    ),
  );

  // reading on another device while this one was in the background
  const onVisible = () => {
    if (document.visibilityState === "visible") {
      void clearReadNotifications(client());
    }
  };
  document.addEventListener("visibilitychange", onVisible);
  onCleanup(() => document.removeEventListener("visibilitychange", onVisible));

  return null;
}
