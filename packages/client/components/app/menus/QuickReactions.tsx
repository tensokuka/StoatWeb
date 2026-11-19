import { For, Show } from "solid-js";

import { useLingui } from "@lingui/solid/macro";
import { Message } from "stoat.js";
import { styled } from "styled-system/jsx";

import { useUser } from "@revolt/client";
import { Emoji } from "@revolt/markdown";
import { useModals } from "@revolt/modal";

import MdAddReaction from "@material-design-icons/svg/outlined/add_reaction.svg?component-solid";

/** Offered when a message doesn't limit which reactions it takes */
const DEFAULT_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

/**
 * A row of one-tap reactions for the top of the message sheet on phones.
 * Tapping one you've already added removes it.
 */
export function QuickReactions(props: {
  message: Message;
  /** Open the full emoji picker */
  onMore?: (event: MouseEvent) => void;
}) {
  const { t } = useLingui();
  const user = useUser();
  const { showError } = useModals();

  const restricted = () => !!props.message.interactions?.restrict_reactions;

  const choices = () =>
    restricted()
      ? (props.message.interactions?.reactions ?? []).slice(0, 7)
      : DEFAULT_REACTIONS;

  const mine = (emoji: string) =>
    !!props.message.reactions.get(emoji)?.has(user()?.id ?? "");

  function toggle(emoji: string) {
    (mine(emoji)
      ? props.message.unreact(emoji)
      : props.message.react(emoji)
    ).catch(showError);
  }

  return (
    <Row role="group" aria-label={t`Quick reactions`}>
      <For each={choices()}>
        {(emoji) => (
          <Choice
            type="button"
            active={mine(emoji)}
            aria-pressed={mine(emoji)}
            onClick={() => toggle(emoji)}
          >
            <Emoji emoji={emoji} />
          </Choice>
        )}
      </For>
      <Show when={!restricted() && props.onMore}>
        <Choice
          type="button"
          aria-label={t`More reactions`}
          onClick={(e) => props.onMore!(e)}
        >
          <MdAddReaction width={24} height={24} />
        </Choice>
      </Show>
    </Row>
  );
}

const Row = styled("div", {
  base: {
    display: "flex",
    justifyContent: "space-between",
    gap: "var(--gap-sm)",
    padding: "0 var(--gap-lg) var(--gap-md)",
    borderBottom: "1px solid var(--md-sys-color-outline-variant)",
    marginBottom: "var(--gap-sm)",
  },
});

const Choice = styled("button", {
  base: {
    display: "grid",
    placeItems: "center",
    width: "44px",
    height: "44px",
    flexShrink: 0,
    border: "none",
    borderRadius: "50%",
    background: "var(--md-sys-color-surface-container-high)",
    color: "var(--md-sys-color-on-surface)",
    fill: "currentColor",
    cursor: "pointer",
    fontSize: "22px",

    "& img": {
      width: "26px",
      height: "26px",
    },
  },
  variants: {
    active: {
      true: {
        background: "var(--md-sys-color-primary-container)",
        outline: "2px solid var(--md-sys-color-primary)",
      },
    },
  },
});
