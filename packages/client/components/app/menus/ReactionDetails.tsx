import { For, Show, createSignal } from "solid-js";

import { Trans, useLingui } from "@lingui/solid/macro";
import { Message } from "stoat.js";
import { styled } from "styled-system/jsx";

import { useClient } from "@revolt/client";
import { Emoji } from "@revolt/markdown";
import { useUsers } from "@revolt/markdown/users";
import { useModals } from "@revolt/modal";
import { Avatar } from "@revolt/ui/components/design";

import MdClose from "@material-design-icons/svg/outlined/close.svg?component-solid";

/**
 * Who reacted to a message, one emoji at a time. Shown in the phone menu
 * sheet, or as a desktop context menu, so taps inside it mustn't close it.
 */
export function ReactionDetails(props: { message: Message; initial?: string }) {
  const { t } = useLingui();
  const client = useClient();
  const { showError } = useModals();
  const [selected, setSelected] = createSignal(props.initial);

  const emojis = () => [...props.message.reactions.keys()];

  // the chosen emoji, or the first left if everyone took theirs back
  const current = () => {
    const choice = selected();
    return choice && props.message.reactions.has(choice) ? choice : emojis()[0];
  };

  const ids = () => [
    ...(props.message.reactions.get(current() ?? "")?.values() ?? []),
  ];
  const users = useUsers(ids);

  const canModerate = () =>
    !!props.message.channel?.havePermission("ManageMessages");

  /** Moderators can take back someone else's reaction */
  function remove(userId: string) {
    const emoji = current();
    if (!emoji) return;
    client()
      .api.delete(
        `/channels/${props.message.channelId as ""}/messages/${props.message.id as ""}/reactions/${emoji as ""}`,
        { user_id: userId } as never,
      )
      .catch(showError);
  }

  return (
    <Show
      when={emojis().length}
      fallback={
        <Empty>
          <Trans>No reactions</Trans>
        </Empty>
      }
    >
      <Tabs role="tablist" aria-label={t`Reactions`}>
        <For each={emojis()}>
          {(emoji) => (
            <Tab
              type="button"
              role="tab"
              aria-selected={emoji === current()}
              selected={emoji === current()}
              onClick={(e) => {
                // keep the menu open
                e.stopImmediatePropagation();
                setSelected(emoji);
              }}
            >
              <Emoji emoji={emoji} />
              <span>{props.message.reactions.get(emoji)?.size ?? 0}</span>
            </Tab>
          )}
        </For>
      </Tabs>

      <List role="list">
        <For each={ids()}>
          {(id, index) => (
            <Person
              role="listitem"
              onClick={(e) => e.stopImmediatePropagation()}
            >
              <Avatar
                size={32}
                src={users()[index()]?.avatar}
                fallback={users()[index()]?.username}
              />
              <Name style={{ color: users()[index()]?.colour ?? undefined }}>
                {users()[index()]?.username ?? t`Loading…`}
              </Name>
              <Show when={canModerate() && id !== client().user?.id}>
                <Remove
                  type="button"
                  aria-label={t`Remove ${users()[index()]?.username ?? ""}'s reaction`}
                  onClick={(e) => {
                    e.stopImmediatePropagation();
                    remove(id);
                  }}
                >
                  <MdClose width={20} height={20} />
                </Remove>
              </Show>
            </Person>
          )}
        </For>
      </List>
    </Show>
  );
}

const Tabs = styled("div", {
  base: {
    display: "flex",
    gap: "var(--gap-sm)",
    overflowX: "auto",
    padding: "0 var(--gap-lg) var(--gap-md)",
    borderBottom: "1px solid var(--md-sys-color-outline-variant)",
    scrollbarWidth: "none",
  },
});

const Tab = styled("button", {
  base: {
    display: "flex",
    alignItems: "center",
    gap: "var(--gap-sm)",
    flexShrink: 0,
    minHeight: "40px",
    padding: "0 var(--gap-md)",
    border: "none",
    borderRadius: "var(--borderRadius-full)",
    background: "var(--md-sys-color-surface-container-high)",
    color: "var(--md-sys-color-on-surface)",
    font: "inherit",
    fontWeight: 600,
    fontFeatureSettings: "'tnum' 1",
    cursor: "pointer",

    "& img": {
      width: "22px",
      height: "22px",
      objectFit: "contain",
    },
  },
  variants: {
    selected: {
      true: {
        background: "var(--md-sys-color-primary-container)",
        color: "var(--md-sys-color-on-primary-container)",
        outline: "2px solid var(--md-sys-color-primary)",
      },
    },
  },
});

const List = styled("div", {
  base: {
    display: "flex",
    flexDirection: "column",
    paddingBlock: "var(--gap-sm)",
  },
});

const Person = styled("div", {
  base: {
    display: "flex",
    alignItems: "center",
    gap: "var(--gap-md)",
    minHeight: "48px",
    padding: "var(--gap-sm) var(--gap-lg)",
  },
});

const Name = styled("span", {
  base: {
    flexGrow: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});

const Remove = styled("button", {
  base: {
    display: "grid",
    placeItems: "center",
    width: "40px",
    height: "40px",
    flexShrink: 0,
    border: "none",
    borderRadius: "50%",
    background: "transparent",
    color: "var(--md-sys-color-error)",
    fill: "currentColor",
    cursor: "pointer",
  },
});

const Empty = styled("div", {
  base: {
    padding: "var(--gap-lg)",
    color: "var(--md-sys-color-on-surface-variant)",
  },
});
