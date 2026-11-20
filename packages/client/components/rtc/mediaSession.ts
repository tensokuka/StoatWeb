import type { Channel } from "stoat.js";

type Action = "hangup" | "togglemicrophone" | "togglecamera";

/**
 * Show the call on the lock screen and in the OS media controls, with
 * hang up, mute and camera buttons where the browser supports them
 * (Chrome on Android and desktop). Does nothing elsewhere.
 */
export function setCallMediaSession(
  channel: Channel | undefined,
  actions: { hangup(): void; toggleMicrophone(): void; toggleCamera(): void },
) {
  if (!("mediaSession" in navigator)) return;
  const session = navigator.mediaSession;

  const handlers: [Action, (() => void) | null][] = channel
    ? [
        ["hangup", actions.hangup],
        ["togglemicrophone", actions.toggleMicrophone],
        ["togglecamera", actions.toggleCamera],
      ]
    : [
        ["hangup", null],
        ["togglemicrophone", null],
        ["togglecamera", null],
      ];

  for (const [action, handler] of handlers) {
    try {
      session.setActionHandler(action as MediaSessionAction, handler);
    } catch {
      // not supported by this browser
    }
  }

  if (!channel) {
    session.metadata = null;
    return;
  }

  const icon =
    channel.server?.iconURL ??
    channel.iconURL ??
    "/assets/web/android-chrome-192x192.png";

  session.metadata = new MediaMetadata({
    title: channel.name ?? channel.recipient?.displayName ?? "Call",
    artist: channel.server?.name ?? "Stoat",
    artwork: [{ src: icon, sizes: "192x192" }],
  });
}

/** Keep the OS mute / camera buttons in step with the call */
export function setCallMediaState(microphone: boolean, camera: boolean) {
  const session = navigator.mediaSession as MediaSession & {
    setMicrophoneActive?(active: boolean): void;
    setCameraActive?(active: boolean): void;
  };
  try {
    session?.setMicrophoneActive?.(microphone);
    session?.setCameraActive?.(camera);
  } catch {
    // not supported
  }
}
