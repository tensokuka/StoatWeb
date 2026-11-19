import {
  Match,
  Show,
  Switch,
  createEffect,
  createSignal,
  on,
  onCleanup,
} from "solid-js";

import { Trans, useLingui } from "@lingui/solid/macro";
import { cva } from "styled-system/css";
import { styled } from "styled-system/jsx";
import { decodeTime, ulid } from "ulid";

import { DraftMessages, Messages } from "@revolt/app";
import { useClient } from "@revolt/client";
import { useBackHandler, useDevice } from "@revolt/common";
import { Keybind, KeybindAction, createKeybind } from "@revolt/keybinds";
import { useNavigate, useSmartParams } from "@revolt/routing";
import { useState } from "@revolt/state";
import { LAYOUT_SECTIONS } from "@revolt/state/stores/Layout";
import {
  BelowFloatingHeader,
  Header,
  IconButton,
  NewMessages,
  Text,
  main,
} from "@revolt/ui";
import { VoiceChannelCallCardMount } from "@revolt/ui/components/features/voice/callCard/VoiceCallCard";
import { Symbol } from "@revolt/ui/components/utils/Symbol";

import { ChannelHeader } from "../ChannelHeader";
import { ChannelPageProps } from "../ChannelPage";

import { Channel } from "stoat.js";
import { MessageComposition } from "./Composition";
import { isLargeServer } from "./largeServer";
import { MemberSidebar } from "./MemberSidebar";
import { TextSearchSidebar } from "./TextSearchSidebar";

/**
 * State of the channel sidebar
 */
export type SidebarState =
  | {
      state: "search";
      query: string;
    }
  | {
      state: "pins";
    }
  | {
      /**
       * Member list opened explicitly, only used on phones where the
       * persisted member sidebar setting would otherwise cover the chat
       */
      state: "members";
    }
  | {
      state: "default";
    };

export function canIHasSidebar(ch: Channel) {
  return !["SavedMessages", "DirectMessage"].includes(ch.type);
}

/**
 * Channel component
 */
export function TextChannel(props: ChannelPageProps) {
  const state = useState();
  const client = useClient();
  const { t } = useLingui();
  const { layout } = useDevice();

  /**
   * On phones the sidebar covers the whole channel as its own page
   */
  const phone = () => layout() === "phone";

  // Last unread message id
  const [lastId, setLastId] = createSignal<string>();

  // Read highlighted message id from parameters
  const params = useSmartParams();
  const navigate = useNavigate();

  /**
   * Message id to be highlighted
   * @returns Message Id
   */
  const highlightMessageId = () => params().messageId;

  const canConnect = () =>
    props.channel.isVoice && props.channel.havePermission("Connect");

  // Get a reference to the message box's load latest function
  let jumpToBottomRef: ((nearby?: string) => void) | undefined;

  const [atEnd, setEnd] = createSignal(true);

  // Store last unread message id
  createEffect(
    on(
      () => props.channel.id,
      (id) =>
        setLastId(
          props.channel.unread
            ? (client().channelUnreads.get(id)?.lastMessageId as string)
            : undefined,
        ),
    ),
  );

  // Mark channel as read whenever it is marked as unread
  createEffect(
    on(
      // must be at the end of the conversation
      () => props.channel.unread && atEnd(),
      (unread) => {
        if (unread) {
          if (document.hasFocus()) {
            // acknowledge the message
            props.channel.ack();
          } else {
            // otherwise mark this location as the last read location
            if (!lastId()) {
              // (taking away one second from the seed)
              setLastId(ulid(decodeTime(props.channel.lastMessageId!) - 1));
            }
          }
        }
      },
    ),
  );

  // Mark as read on re-focus
  function onFocus() {
    if (props.channel.unread && atEnd()) {
      props.channel.ack();
    }
  }

  function onVisibilityChange() {
    if (document.visibilityState === "visible") onFocus();
  }

  // Chromium + webkit
  window.addEventListener("focus", onFocus);
  // Gecko
  document.addEventListener("focus", onFocus);
  // Mobile (eg. unlock screen)
  document.addEventListener("visibilitychange", onVisibilityChange);
  onCleanup(() => {
    // Mobile
    document.removeEventListener("visibilitychange", onVisibilityChange);
    // Gecko
    document.removeEventListener("focus", onFocus);
    // Chromium + webkit
    window.removeEventListener("focus", onFocus);
  });

  // Register ack/jump latest
  createKeybind(KeybindAction.CHAT_JUMP_END, () => {
    // Mark channel as read if not already
    if (props.channel.unread) {
      props.channel.ack();
    }

    // Clear the last unread id
    if (lastId()) {
      setLastId(undefined);
    }

    // Scroll to the bottom
    jumpToBottomRef?.();
  });

  // Sidebar scroll target
  let sidebarScrollTargetElement!: HTMLDivElement;

  // Sidebar state
  const [sidebarState, setSidebarState] = createSignal<SidebarState>({
    state: "default",
  });

  // todo: in the future maybe persist per ID?
  createEffect(
    on(
      () => props.channel.id,
      () => setSidebarState({ state: "default" }),
    ),
  );

  /**
   * Whether the sidebar is showing
   */
  const sidebarOpen = () =>
    phone()
      ? sidebarState().state !== "default"
      : (state.layout.getSectionState(LAYOUT_SECTIONS.MEMBER_SIDEBAR, true) &&
          canIHasSidebar(props.channel)) ||
        sidebarState().state !== "default";

  const closeSidebar = () => setSidebarState({ state: "default" });

  // On phones the sidebar is a page of its own, so Back closes it
  useBackHandler(
    () => phone() && sidebarState().state !== "default",
    closeSidebar,
  );

  /**
   * On phones, picking a search result or pin has to reveal the chat before
   * jumping, otherwise the highlighted message is hidden behind the page
   */
  function pickResult(path: string) {
    // Dismiss the keyboard first: on iOS it resizes the viewport as it
    // closes, which would interrupt the scroll to the message
    const focused = document.activeElement;
    const keyboardOpen =
      focused instanceof HTMLInputElement ||
      focused instanceof HTMLTextAreaElement;
    if (focused instanceof HTMLElement) focused.blur();

    closeSidebar();

    // picking the message that is already highlighted wouldn't change the
    // route, so clear it first to jump again
    if (highlightMessageId() && path.endsWith(`/${highlightMessageId()}`)) {
      navigate(".");
    }

    // let the layout settle before jumping
    setTimeout(() => navigate(path), keyboardOpen ? 400 : 50);
  }

  /**
   * Title for the full-screen sidebar on phones
   */
  const phoneTitle = () => {
    switch (sidebarState().state) {
      case "pins":
        return t`Pinned messages`;
      case "search":
        return t`Search`;
      default:
        return t`Members`;
    }
  };

  // If this is a server text channel, sync the members
  // todo: useQuery
  createEffect(
    on(
      () => props.channel.serverId,
      (serverId, prevServerId) =>
        // This effect tracks channel, not serverId, therefore we must ensure the old serverId
        // is not the same as the current serverId
        prevServerId !== serverId &&
        props.channel.type === "TextChannel" &&
        props.channel.server?.syncMembers(isLargeServer(props.channel.server)),
    ),
  );

  return (
    <>
      <Header placement="primary">
        <ChannelHeader
          channel={props.channel}
          sidebarState={sidebarState}
          setSidebarState={setSidebarState}
        />
      </Header>
      <Content>
        <main class={main()}>
          <Show
            when={canConnect()}
            fallback={
              <BelowFloatingHeader>
                <div>
                  <NewMessages
                    lastId={lastId}
                    jumpBack={() => navigate(lastId()!)}
                    dismiss={() => setLastId()}
                  />
                </div>
              </BelowFloatingHeader>
            }
          >
            <VoiceChannelCallCardMount channel={props.channel} />
          </Show>

          <Messages
            channel={props.channel}
            lastReadId={lastId}
            pendingMessages={(pendingProps) => (
              <DraftMessages
                channel={props.channel}
                tail={pendingProps.tail}
                sentIds={pendingProps.ids}
              />
            )}
            highlightedMessageId={highlightMessageId}
            clearHighlightedMessage={() => navigate(".")}
            jumpToBottomRef={(ref) => (jumpToBottomRef = ref)}
            atEnd={[atEnd, setEnd]}
          />

          <MessageComposition
            channel={props.channel}
            onMessageSend={() => jumpToBottomRef?.()}
          />
        </main>
        <Show when={sidebarOpen()}>
          <div
            ref={sidebarScrollTargetElement}
            use:scrollable={{
              direction: "y",
              showOnHover: true,
              class: sidebar({ phone: phone() }),
            }}
            style={{
              width:
                !phone() && sidebarState().state !== "default" ? "360px" : "",
            }}
            // the panel covers the chat on phones, so swipes shouldn't
            // pull the channel drawer out from under it
            data-no-drawer={phone() ? "" : undefined}
          >
            <Show when={phone()}>
              <PhonePanelBar>
                <IconButton
                  onPress={closeSidebar}
                  use:floating={{
                    tooltip: {
                      placement: "bottom",
                      content: t`Back to chat`,
                    },
                  }}
                >
                  <Symbol>arrow_back</Symbol>
                </IconButton>
                <Show
                  when={sidebarState().state === "search"}
                  fallback={
                    <Text class="title" size="large">
                      {phoneTitle()}
                    </Text>
                  }
                >
                  <PhoneSearchBox
                    type="search"
                    enterkeyhint="search"
                    placeholder={t`Search messages...`}
                    value={(sidebarState() as { query: string }).query}
                    ref={(el) =>
                      // focus once mounted so the keyboard comes up right away
                      queueMicrotask(() => {
                        if (!el.value) el.focus();
                      })
                    }
                    onChange={(e) =>
                      setSidebarState({
                        state: "search",
                        query: e.currentTarget.value,
                      })
                    }
                  />
                </Show>
              </PhonePanelBar>
            </Show>
            <Switch
              fallback={
                <MemberSidebar
                  channel={props.channel}
                  scrollTargetElement={sidebarScrollTargetElement}
                  isLargeServer={isLargeServer(props.channel.server)}
                />
              }
            >
              <Match when={sidebarState().state === "search"}>
                <WideSidebarContainer>
                  <Show when={!phone()}>
                    <SidebarTitle>
                      <Text class="label" size="large">
                        <Trans>Search Results</Trans>
                      </Text>
                    </SidebarTitle>
                  </Show>
                  <TextSearchSidebar
                    channel={props.channel}
                    query={{
                      query: (sidebarState() as { query: string }).query,
                    }}
                    onPick={phone() ? pickResult : undefined}
                  />
                </WideSidebarContainer>
              </Match>
              <Match when={sidebarState().state === "pins"}>
                <WideSidebarContainer>
                  <Show when={!phone()}>
                    <SidebarTitle>
                      <Text class="label" size="large">
                        <Trans>Pinned Messages</Trans>
                      </Text>
                    </SidebarTitle>
                  </Show>
                  <TextSearchSidebar
                    channel={props.channel}
                    query={{ pinned: true, sort: "Latest" }}
                    onPick={phone() ? pickResult : undefined}
                  />
                </WideSidebarContainer>
              </Match>
            </Switch>

            <Show when={sidebarState().state !== "default"}>
              <Keybind
                keybind={KeybindAction.CLOSE_SIDEBAR}
                onPressed={closeSidebar}
              />
            </Show>
          </div>
        </Show>
      </Content>
    </>
  );
}

/**
 * Main content row layout
 */
const Content = styled("div", {
  base: {
    display: "flex",
    flexDirection: "row",
    flexGrow: 1,
    minWidth: 0,
    minHeight: 0,
  },
});

/**
 * Base styles
 */
const sidebar = cva({
  base: {
    flexShrink: 0,
    width: "var(--layout-width-channel-sidebar)",
    // margin: "var(--gap-md)",
    borderRadius: "var(--borderRadius-lg)",
    // color: "var(--colours-sidebar-channels-foreground)",
    // background: "var(--colours-sidebar-channels-background)",
  },
  variants: {
    phone: {
      // a full-screen page over the channel, header included
      true: {
        position: "fixed",
        inset: 0,
        zIndex: 20,
        width: "100%",
        borderRadius: 0,
        background: "var(--md-sys-color-surface)",
        paddingInline: "var(--inset-left) var(--inset-right)",
        paddingBottom: "var(--inset-bottom)",
      },
      false: {},
    },
  },
  defaultVariants: {
    phone: false,
  },
});

/**
 * Top bar of the full-screen sidebar on phones, stays put while the list scrolls
 */
const PhonePanelBar = styled("div", {
  base: {
    position: "sticky",
    top: 0,
    zIndex: 1,

    display: "flex",
    alignItems: "center",
    gap: "var(--gap-md)",

    paddingTop: "var(--inset-top)",
    paddingInline: "var(--gap-sm) var(--gap-md)",
    minHeight: "calc(56px + var(--inset-top))",

    background: "var(--md-sys-color-surface)",
    color: "var(--md-sys-color-on-surface)",
    fill: "var(--md-sys-color-on-surface)",
  },
});

/**
 * Search field in the phone top bar
 */
const PhoneSearchBox = styled("input", {
  base: {
    flexGrow: 1,
    minWidth: 0,
    height: "44px",
    paddingInline: "16px",
    borderRadius: "var(--borderRadius-full)",
    background: "var(--md-sys-color-surface-container-high)",
    color: "var(--md-sys-color-on-surface)",

    // iOS zooms into inputs with text under 16px
    fontSize: "16px",
  },
});

/**
 * Container styles
 */
const WideSidebarContainer = styled("div", {
  base: {
    paddingRight: "var(--gap-md)",
    width: "360px",

    _phone: {
      width: "100%",
      paddingInline: "var(--gap-md)",
    },
  },
});

/**
 * Sidebar title
 */
const SidebarTitle = styled("div", {
  base: {
    padding: "var(--gap-md)",
    color: "var(--md-sys-color-on-surface)",
  },
});
