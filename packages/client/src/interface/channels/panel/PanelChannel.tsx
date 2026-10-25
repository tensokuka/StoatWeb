import {
  Component,
  For,
  Match,
  Show,
  Switch,
  createMemo,
  createResource,
} from "solid-js";
import { Dynamic } from "solid-js/web";

import { Trans } from "@lingui/solid/macro";
import { styled } from "styled-system/jsx";

import { useClient } from "@revolt/client";
import { getPanelBridge } from "@revolt/common";
import { Button, CircularProgress, Header, Text } from "@revolt/ui";

import { ChannelHeader } from "../ChannelHeader";
import { ChannelPageProps } from "../ChannelPage";

import { PanelBridge } from "./bridge";
import { WIDGETS, WidgetProps } from "./widgets";

/**
 * Panel room: a grid of widgets backed by a homelab bridge
 */
export function PanelChannel(props: ChannelPageProps) {
  const client = useClient();

  const bridge = createMemo(() => {
    const url = getPanelBridge(props.channel.description);
    return url ? new PanelBridge(url, client(), props.channel.id) : undefined;
  });

  const [manifest, { refetch }] = createResource(bridge, (b) => b.manifest());

  return (
    <>
      <Header placement="primary">
        <ChannelHeader channel={props.channel} />
      </Header>
      <Content
        use:scrollable={{
          direction: "y",
          showOnHover: true,
        }}
      >
        <Switch>
          <Match when={!bridge()}>
            <Notice>
              <Trans>
                No panel bridge configured. Set VITE_PANEL_BRIDGE_URL or use
                [panel:https://your-bridge] in the channel description.
              </Trans>
            </Notice>
          </Match>
          <Match when={manifest.error}>
            <Notice>
              <Text class="title">
                <Trans>Couldn't load this panel</Trans>
              </Text>
              <Text class="body">{String(manifest.error?.message)}</Text>
              <Button variant="tonal" onPress={refetch}>
                <Trans>Retry</Trans>
              </Button>
            </Notice>
          </Match>
          <Match when={manifest.loading && !manifest.latest}>
            <Notice>
              <CircularProgress />
            </Notice>
          </Match>
          <Match when={manifest.latest}>
            {(m) => (
              <Grid style={{ "--columns": m().columns }}>
                <For each={m().widgets}>
                  {(widget) => (
                    <Card
                      style={{ "--span-w": widget.w, "--span-h": widget.h }}
                    >
                      <Show when={widget.title}>
                        <Text class="label" size="large">
                          {widget.title}
                        </Text>
                      </Show>
                      <Dynamic
                        component={
                          WIDGETS[widget.type] as Component<WidgetProps>
                        }
                        widget={widget}
                        bridge={bridge()!}
                      />
                    </Card>
                  )}
                </For>
              </Grid>
            )}
          </Match>
        </Switch>
      </Content>
    </>
  );
}

const Content = styled("div", {
  base: {
    flexGrow: 1,
    minHeight: 0,
    padding: "16px",
  },
});

const Notice = styled("div", {
  base: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "12px",
    padding: "48px 16px",
    textAlign: "center",
  },
});

const Grid = styled("div", {
  base: {
    display: "grid",
    gridTemplateColumns: "repeat(var(--columns), minmax(0, 1fr))",
    gridAutoRows: "minmax(80px, auto)",
    gap: "12px",

    "@media (max-width: 768px)": {
      gridTemplateColumns: "minmax(0, 1fr)",
    },
  },
});

const Card = styled("div", {
  base: {
    gridColumn: "span var(--span-w)",
    gridRow: "span var(--span-h)",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    minWidth: 0,
    padding: "16px",
    borderRadius: "var(--borderRadius-lg)",
    background: "var(--md-sys-color-surface-container-low)",
    color: "var(--md-sys-color-on-surface)",

    "@media (max-width: 768px)": {
      gridColumn: "1 / -1",
    },
  },
});
