import { createEffect, onCleanup } from "solid-js";

import { useLingui } from "@lingui/solid/macro";
import {
  ChannelEditSystemMessage,
  ChannelOwnershipChangeSystemMessage,
  ChannelRenamedSystemMessage,
  Message,
  MessagePinnedSystemMessage,
  TextSystemMessage,
  UserModeratedSystemMessage,
  UserSystemMessage,
} from "stoat.js";

import { useDevice } from "@revolt/common";
import { useNavigate, useSmartParams } from "@revolt/routing";
import { useState } from "@revolt/state";

import {
  NOTIFICATION_OPEN_MESSAGE,
  resolveNotificationTarget,
} from "../../src/notificationClick";

import { useClient, useNotifications, useSound } from ".";

/**
 * Process and display desktop notifications
 */
export function NotificationsWorker() {
  const state = useState();
  const { t } = useLingui();
  const client = useClient();
  const navigate = useNavigate();
  const params = useSmartParams();
  const sound = useSound();
  const { isMobile, isIOSTouch } = useDevice();

  const { initNotifications } = useNotifications();

  /**
   * Handle incoming messages
   * @param message Message
   */
  function onMessage(message: Message) {
    const us = client().user!;

    // Ignore if we are currently looking at the channel
    if (params().channelId === message.channelId && document.hasFocus()) return;

    // Ignore our own messages
    if (message.author?.self) return;

    // Ignore blocked users
    if (message.author?.relationship === "Blocked") return;

    // Ignore muted channels
    if (state.notifications.isMuted(message.channel)) return;

    // Check channel notification settings
    switch (state.notifications.computeForChannel(message.channel!)) {
      case "none":
        return; // ignore if muted/none
      case "mention":
        if (!message.mentioned) return; // ignore if not mentioned
    }

    // Ignore if we're busy or focused
    if (
      us.status?.presence === "Busy" ||
      (us.status?.presence === "Focus" && !message.mentioned)
    )
      return;

    // Generate the title
    let title;
    switch (message.channel!.type) {
      case "SavedMessages":
        return;
      case "DirectMessage":
        title = `@${message.username}`;
        break;
      case "Group":
        if (message.author?.id === "00000000000000000000000000") {
          title = message.channel?.name;
        } else {
          title = `@${message.username} - ${message.channel?.name}`;
        }
        break;
      case "TextChannel":
        title = `@${message.username} (#${message.channel?.name}, ${message.channel?.server?.name})`;
        break;
    }

    // Find image if applicable
    const image = message.attachments?.find(
      (x) => x.metadata.type === "Image",
    )?.previewUrl;

    // Find body/icon
    let body, icon;
    if (message.content) {
      body = message.contentPlain;
      icon = message.avatarURL;
    } else if (message.systemMessage) {
      switch (message.systemMessage.type) {
        case "text":
          body = (message.systemMessage as TextSystemMessage).content;
          break;
        case "user_added":
          body = t`${
            (message.systemMessage as UserModeratedSystemMessage).user?.username
          } was added by ${
            (message.systemMessage as UserModeratedSystemMessage).by?.username
          }`;
          icon = (message.systemMessage as UserModeratedSystemMessage).user
            ?.avatarURL;
          break;
        case "user_remove":
          body = t`${
            (message.systemMessage as UserModeratedSystemMessage).user?.username
          } was removed by ${
            (message.systemMessage as UserModeratedSystemMessage).by?.username
          }`;
          icon = (message.systemMessage as UserModeratedSystemMessage).user
            ?.avatarURL;
          break;
        case "user_joined":
          body = t`${
            (message.systemMessage as UserSystemMessage).user?.username
          } joined`;
          icon = (message.systemMessage as UserSystemMessage).user?.avatarURL;
          break;
        case "user_left":
          body = t`${
            (message.systemMessage as UserSystemMessage).user?.username
          } left`;
          icon = (message.systemMessage as UserSystemMessage).user?.avatarURL;
          break;
        case "user_kicked":
          body = t`${
            (message.systemMessage as UserSystemMessage).user?.username
          } was kicked`;
          icon = (message.systemMessage as UserSystemMessage).user?.avatarURL;
          break;
        case "user_banned":
          body = t`${
            (message.systemMessage as UserSystemMessage).user?.username
          } was banned`;
          icon = (message.systemMessage as UserSystemMessage).user?.avatarURL;
          break;
        case "channel_renamed":
          body = t`${
            (message.systemMessage as ChannelRenamedSystemMessage).by?.username
          } renamed the channel`;
          icon = (message.systemMessage as ChannelRenamedSystemMessage).by
            ?.avatarURL;
          break;
        case "channel_description_changed":
          body = t`${
            (message.systemMessage as ChannelEditSystemMessage).by?.username
          } changed the channel description`;
          icon = (message.systemMessage as ChannelEditSystemMessage).by
            ?.avatarURL;
          break;
        case "channel_icon_changed":
          body = t`${
            (message.systemMessage as ChannelEditSystemMessage).by?.username
          } changed the channel icon`;
          icon = (message.systemMessage as ChannelEditSystemMessage).by
            ?.avatarURL;
          break;
        case "channel_ownership_changed":
          body = t`${
            (message.systemMessage as ChannelOwnershipChangeSystemMessage).from
              ?.username
          } made ${
            (message.systemMessage as ChannelOwnershipChangeSystemMessage).to
              ?.username
          } the new group owner`;
          icon = (message.systemMessage as ChannelOwnershipChangeSystemMessage)
            .from?.avatarURL;
          break;
        case "message_pinned":
          body = t`${
            (message.systemMessage as MessagePinnedSystemMessage).by?.username
          } pinned a message`;
          icon = (message.systemMessage as MessagePinnedSystemMessage).by
            ?.avatarURL;
          break;
        case "message_unpinned":
          body = t`${
            (message.systemMessage as MessagePinnedSystemMessage).by?.username
          } unpinned a message`;
          icon = (message.systemMessage as MessagePinnedSystemMessage).by
            ?.avatarURL;
          break;
      }
    } else if (message.attachments?.length) {
      body = t`Sent ${message.attachments!.length} attachments`;
    }

    // Don't continue without notification permissions (iOS only has Notification in home screen apps)
    if (
      typeof Notification === "undefined" ||
      Notification.permission !== "granted" ||
      state.settings.desktopNotificationsState !== "allowed"
    )
      return;

    sound.playSound("message");

    showNotification(
      title!,
      {
        icon,
        // @ts-expect-error this does exist on some platforms
        image,
        body,
        timestamp: message.createdAt,
        tag: message.channelId,
        badge: "/assets/web/android-chrome-512x512.png",
        silent: true,
      },
      message.path,
    );
  }

  /**
   * Show a notification which opens the given path when clicked
   * @param title Title
   * @param options Notification options
   * @param path Path within the app
   */
  async function showNotification(
    title: string,
    options: NotificationOptions,
    path: string,
  ) {
    // Mobile browsers require notifications to come from a service worker
    if (!isMobile && !isIOSTouch) {
      try {
        const notification = new Notification(title, options);
        notification.addEventListener("click", () => {
          window.focus();
          navigate(path);
        });
        return;
      } catch {
        // Not supported here, so try the service worker instead
      }
    }

    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const registration = await navigator.serviceWorker.getRegistration();
      await registration?.showNotification(title, {
        ...options,
        data: `${location.origin}${base}${path}`,
      });
    } catch (e) {
      console.error("Failed to show notification", e);
    }
  }

  /**
   * Open the target of a notification clicked while the app is already running
   * @param event Message from a service worker
   */
  function onWorkerMessage(event: MessageEvent) {
    if (event.data?.type !== NOTIFICATION_OPEN_MESSAGE) return;

    const target = resolveNotificationTarget(event.data.url, client().user?.id);
    if ("path" in target) {
      navigate(target.path);
    } else if (new URL(target.reload).pathname === location.pathname) {
      // Changing only the hash wouldn't load the page and switch accounts
      location.hash = new URL(target.reload).hash;
      location.reload();
    } else {
      location.assign(target.reload);
    }
  }

  navigator.serviceWorker?.addEventListener("message", onWorkerMessage);
  onCleanup(() =>
    navigator.serviceWorker?.removeEventListener("message", onWorkerMessage),
  );

  createEffect(() => {
    client().addListener("messageCreate", onMessage);
    onCleanup(() => client().removeListener("messageCreate", onMessage));
  });

  /**
   * Handle page click to request notifications
   */
  function tryRequest() {
    document.removeEventListener("click", tryRequest);

    initNotifications();
  }

  createEffect(() => {
    if (client().ready()) document.addEventListener("click", tryRequest);
  });

  onCleanup(() => document.removeEventListener("click", tryRequest));

  return null;
}
