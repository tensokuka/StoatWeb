import { Trans } from "@lingui/solid/macro";
import { For, Show, createSignal, onCleanup, onMount } from "solid-js";
import { styled } from "styled-system/jsx";

import { Button, Column, Row, Text } from "@revolt/ui";

import {
  PushLogEntry,
  addPushLog,
  clearPushLog,
  readPushLog,
} from "../../../../../../src/pushLog";

interface WorkerInfo {
  registration: ServiceWorkerRegistration;
  scope: string;
  script: string;
  state: string;
  push: string;
}

/**
 * Shows the service workers, their push subscriptions and what the push
 * workers logged, so push problems can be traced on a phone without a
 * desktop debugger.
 */
export default function PushDiagnostics() {
  const [workers, setWorkers] = createSignal<WorkerInfo[]>([]);
  const [log, setLog] = createSignal<PushLogEntry[]>([]);
  const [busy, setBusy] = createSignal(false);

  const supported = "serviceWorker" in navigator;

  async function refresh() {
    if (!supported) return;
    setBusy(true);
    try {
      const found: WorkerInfo[] = [];
      for (const registration of await navigator.serviceWorker.getRegistrations()) {
        const worker =
          registration.active ??
          registration.waiting ??
          registration.installing;
        let push = "none";
        try {
          const subscription =
            await registration.pushManager?.getSubscription();
          if (subscription) push = shortEndpoint(subscription.endpoint);
        } catch (e) {
          push = `error: ${e}`;
        }

        found.push({
          registration,
          scope: registration.scope,
          script: worker ? fileName(worker.scriptURL) : "none",
          state: worker?.state ?? "none",
          push,
        });
      }
      setWorkers(found);
      setLog(await readPushLog());
    } finally {
      setBusy(false);
    }
  }

  async function testNotification(info: WorkerInfo) {
    const time = Date.now();
    try {
      await info.registration.showNotification("Stoat test notification", {
        body: `Shown by the worker for ${info.scope}`,
      });
      await addPushLog({
        time,
        kind: "test",
        scope: info.scope,
        detail: "shown",
      });
    } catch (e) {
      await addPushLog({
        time,
        kind: "test",
        scope: info.scope,
        detail: `showNotification failed: ${e}`,
      });
    }
    await refresh();
  }

  async function clear() {
    await clearPushLog();
    await refresh();
  }

  onMount(() => {
    refresh();
    // Pick up pushes that arrive while this page is open
    const timer = setInterval(() => void readPushLog().then(setLog), 5000);
    onCleanup(() => clearInterval(timer));
  });

  return (
    <Column>
      <Text class="title">
        <Trans>Push diagnostics</Trans>
      </Text>

      <Mono>
        permission:{" "}
        {"Notification" in window ? Notification.permission : "unavailable"}
        {"\n"}
        installed app:{" "}
        {matchMedia("(display-mode: standalone)").matches ||
        (navigator as never as { standalone?: boolean }).standalone
          ? "yes"
          : "no"}
      </Mono>

      <Show
        when={supported}
        fallback={<Mono>Service workers are not available here.</Mono>}
      >
        <Text class="label">
          <Trans>Background workers</Trans>
        </Text>
        <Show
          when={workers().length}
          fallback={<Mono>{busy() ? "loading…" : "none registered"}</Mono>}
        >
          <For each={workers()}>
            {(info) => (
              <Entry>
                <Mono>
                  scope: {info.scope}
                  {"\n"}script: {info.script} ({info.state}){"\n"}push:{" "}
                  {info.push}
                </Mono>
                <Row>
                  <Button
                    size="sm"
                    variant="tonal"
                    onPress={() => testNotification(info)}
                  >
                    <Trans>Test notification from this worker</Trans>
                  </Button>
                </Row>
              </Entry>
            )}
          </For>
        </Show>

        <Text class="label">
          <Trans>Push log (newest first)</Trans>
        </Text>
        <Show
          when={log().length}
          fallback={<Mono>No pushes have reached a push worker yet.</Mono>}
        >
          <Mono>
            <For each={log()}>
              {(entry) => (
                <>
                  {formatTime(entry.time)} {entry.kind.padEnd(8)}{" "}
                  {scopeLabel(entry.scope)} {entry.detail ?? ""}
                  {"\n"}
                </>
              )}
            </For>
          </Mono>
        </Show>

        <Row>
          <Button size="sm" variant="tonal" onPress={refresh}>
            <Trans>Refresh</Trans>
          </Button>
          <Button size="sm" variant="outlined" onPress={clear}>
            <Trans>Clear log</Trans>
          </Button>
        </Row>
      </Show>
    </Column>
  );
}

/** Host and the start of the path; the full endpoint is a credential */
function shortEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    return `${url.host}${url.pathname.slice(0, 10)}…`;
  } catch {
    return "unreadable";
  }
}

function fileName(url: string) {
  return url.slice(url.lastIndexOf("/") + 1);
}

/** The part of a scope that tells workers apart */
function scopeLabel(scope: string) {
  try {
    const url = new URL(scope);
    return `[${url.pathname}${url.search}]`;
  } catch {
    return `[${scope}]`;
  }
}

function formatTime(time: number) {
  return new Date(time).toLocaleTimeString();
}

const Mono = styled("pre", {
  base: {
    margin: 0,
    padding: "var(--gap-md)",
    borderRadius: "var(--borderRadius-md)",
    background: "var(--md-sys-color-surface-container)",
    color: "var(--md-sys-color-on-surface)",
    fontFamily: "var(--fonts-monospace)",
    fontSize: "12px",
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    userSelect: "text",
  },
});

const Entry = styled("div", {
  base: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--gap-sm)",
  },
});
