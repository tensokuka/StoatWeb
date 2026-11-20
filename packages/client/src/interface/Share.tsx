import { For, Show, createMemo, createSignal } from "solid-js";

import { Trans, useLingui } from "@lingui/solid/macro";
import type { Channel } from "stoat.js";
import { styled } from "styled-system/jsx";

import { useClient } from "@revolt/client";
import { useLocation, useNavigate } from "@revolt/routing";
import { useState } from "@revolt/state";
import { Avatar, Header, List, ListItem, main } from "@revolt/ui";
import { Symbol } from "@revolt/ui/components/utils/Symbol";

import { HeaderIcon } from "./common/CommonHeader";
import { sharedText } from "./sharedText";

/**
 * Pick where to send something shared from another app. The text goes into
 * that conversation's message box, ready to edit and send.
 */
export function Share() {
  const { t } = useLingui();
  const client = useClient();
  const state = useState();
  const navigate = useNavigate();
  const location = useLocation();
  const [filter, setFilter] = createSignal("");

  const text = () => sharedText(new URLSearchParams(location.search));

  const name = (channel: Channel) =>
    channel.type === "DirectMessage"
      ? (channel.recipient?.displayName ?? channel.recipient?.username ?? "")
      : (channel.name ?? "");

  const channels = createMemo(() => {
    const query = filter().trim().toLowerCase();
    return client()
      .channels.toList()
      .filter(
        (channel) =>
          (channel.type === "DirectMessage" ||
            channel.type === "Group" ||
            channel.type === "TextChannel" ||
            channel.type === "SavedMessages") &&
          (channel.type !== "DirectMessage" || channel.active) &&
          channel.havePermission("SendMessage"),
      )
      .filter(
        (channel) =>
          !query ||
          name(channel).toLowerCase().includes(query) ||
          channel.server?.name.toLowerCase().includes(query),
      )
      .sort((a, b) => +b.updatedAt - +a.updatedAt)
      .slice(0, 100);
  });

  function pick(channel: Channel) {
    const shared = text();
    state.draft.setDraft(channel.id, (draft) => ({
      ...draft,
      content: draft.content ? `${draft.content}\n${shared}` : shared,
    }));
    navigate(
      channel.server
        ? `/server/${channel.server.id}/channel/${channel.id}`
        : `/channel/${channel.id}`,
      { replace: true },
    );
  }

  return (
    <Base>
      <Header placement="primary">
        <HeaderIcon>
          <Symbol>share</Symbol>
        </HeaderIcon>
        <Trans>Share to…</Trans>
      </Header>

      <main class={main()}>
        <Content>
          <Show
            when={text()}
            fallback={
              <Preview>
                <Trans>Nothing was shared.</Trans>
              </Preview>
            }
          >
            <Preview>{text()}</Preview>
            <Search
              type="search"
              placeholder={t`Search conversations`}
              aria-label={t`Search conversations`}
              value={filter()}
              onInput={(e) => setFilter(e.currentTarget.value)}
            />
            <List>
              <For each={channels()}>
                {(channel) => (
                  <ListItem onClick={() => pick(channel)}>
                    <Avatar
                      slot="icon"
                      size={36}
                      src={
                        channel.type === "DirectMessage"
                          ? channel.recipient?.animatedAvatarURL
                          : (channel.iconURL ?? channel.server?.iconURL)
                      }
                      fallback={name(channel) || "#"}
                    />
                    <Show
                      when={channel.type !== "SavedMessages"}
                      fallback={<Trans>Saved Notes</Trans>}
                    >
                      {channel.type === "TextChannel" ? "#" : ""}
                      {name(channel)}
                    </Show>
                    <Show when={channel.server}>
                      <span slot="description">{channel.server!.name}</span>
                    </Show>
                  </ListItem>
                )}
              </For>
            </List>
          </Show>
        </Content>
      </main>
    </Base>
  );
}

const Base = styled("div", {
  base: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
  },
});

const Content = styled("div", {
  base: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--gap-md)",
    overflowY: "auto",
    padding: "var(--gap-lg)",
  },
});

const Preview = styled("div", {
  base: {
    padding: "var(--gap-md) var(--gap-lg)",
    borderRadius: "var(--borderRadius-lg)",
    background: "var(--md-sys-color-surface-container)",
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    maxHeight: "8em",
    overflowY: "auto",
  },
});

const Search = styled("input", {
  base: {
    padding: "var(--gap-md) var(--gap-lg)",
    minHeight: "44px",
    border: "1px solid var(--md-sys-color-outline-variant)",
    borderRadius: "var(--borderRadius-full)",
    background: "var(--md-sys-color-surface-container-low)",
    color: "var(--md-sys-color-on-surface)",
    font: "inherit",
    // 16px so iOS doesn't zoom in on focus
    fontSize: "16px",
  },
});
