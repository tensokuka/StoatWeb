import { For, JSX, Match, Show, Switch, children } from "solid-js";

import { Trans } from "@lingui/solid/macro";
import { Channel } from "stoat.js";

import { useInstance } from "@revolt/instance";
import { useModals } from "@revolt/modal";
import { useState } from "@revolt/state";

import MdBadge from "@material-design-icons/svg/outlined/badge.svg?component-solid";
import MdDelete from "@material-design-icons/svg/outlined/delete.svg?component-solid";
import MdMoveToCategory from "@material-design-icons/svg/outlined/drive_file_move.svg?component-solid";
import MdGroupAdd from "@material-design-icons/svg/outlined/group_add.svg?component-solid";
import MdLibraryAdd from "@material-design-icons/svg/outlined/library_add.svg?component-solid";
import MdLogout from "@material-design-icons/svg/outlined/logout.svg?component-solid";
import MdMarkChatRead from "@material-design-icons/svg/outlined/mark_chat_read.svg?component-solid";
import MdSettings from "@material-design-icons/svg/outlined/settings.svg?component-solid";
import MdShare from "@material-design-icons/svg/outlined/share.svg?component-solid";
import MdShield from "@material-design-icons/svg/outlined/shield.svg?component-solid";
import MdRadioButtonChecked from "@material-symbols/svg-400/outlined/radio_button_checked-fill.svg?component-solid";
import MdRadioButtonUnchecked from "@material-symbols/svg-400/outlined/radio_button_unchecked.svg?component-solid";

import {
  categoryOf,
  moveChannelToCategory,
} from "../../../src/interface/navigation/channels/ordering";
import {
  ContextMenu,
  ContextMenuButton,
  ContextMenuDivider,
  ContextMenuSubMenu,
} from "./ContextMenu";
import { NotificationContextMenu } from "./shared/NotificationContextMenu";

/**
 * Context menu for channels
 */
export function ChannelContextMenu(props: {
  channel: Channel;
  /**
   * Extra items shown at the top, e.g. header actions hidden on phones
   */
  prepend?: JSX.Element;
  /**
   * Opened from inside the channel (its header's ⋮ button), not from the
   * channel list, so leave out actions that belong to the list
   */
  inChannel?: boolean;
}) {
  const state = useState();
  const instance = useInstance();
  const { openModal, showError } = useModals();
  const prepend = children(() => props.prepend);

  /**
   * Mark channel as read
   */
  function markAsRead() {
    props.channel.ack();
  }

  /**
   * Create a new invite
   */
  function createInvite() {
    openModal({
      type: "create_invite",
      channel: props.channel,
    });
  }

  function getCategory(channel: Channel) {
    const cats = channel.server!.orderedChannels;
    let cat, ch;
    for (cat of cats)
      for (ch of cat.channels) if (ch.id === channel.id) return cat.id;
  }

  /**
   * Create a new channel
   */
  function createChannel() {
    openModal({
      type: "create_channel",
      server: props.channel.server!,
      categoryId: getCategory(props.channel),
    });
  }

  /**
   * Move this channel to the end of a category ("default" for none)
   */
  function moveTo(categoryId: string) {
    const server = props.channel.server!;
    server
      .edit({
        categories: moveChannelToCategory(
          server.categories,
          server.channels.map((channel) => channel.id),
          props.channel.id,
          categoryId,
        ),
      })
      .catch(showError);
  }

  /**
   * Create a new category
   */
  function createCategory() {
    openModal({
      type: "create_category",
      server: props.channel.server!,
    });
  }

  /**
   * Edit channel
   */
  function editChannel() {
    openModal({
      type: "settings",
      config: "channel",
      context: props.channel,
    });
  }

  /**
   * Delete channel
   */
  function deleteChannel() {
    openModal({
      type: "delete_channel",
      channel: props.channel,
    });
  }

  /**
   * Open channel in Stoat Admin Panel
   */
  function openAdminPanel() {
    window.open(
      `https://admin.stoatinternal.com/panel/inspect/channel/${props.channel.id}`,
      "_blank",
    );
  }

  /**
   * Copy channel link to clipboard
   */
  function copyLink() {
    navigator.clipboard.writeText(
      instance.href(
        `${
          props.channel.server ? `/server/${props.channel.server?.id}` : ""
        }/channel/${props.channel.id}`,
      ),
    );
  }

  /**
   * Copy channel id to clipboard
   */
  function copyId() {
    navigator.clipboard.writeText(props.channel.id);
  }

  return (
    <ContextMenu>
      <Show when={prepend.toArray().some(Boolean)}>
        {prepend()}
        <ContextMenuDivider />
      </Show>
      <Show
        when={
          props.channel.unread ||
          !!props.channel.mentions?.size ||
          props.channel.havePermission("InviteOthers")
        }
      >
        <Show when={props.channel.unread || !!props.channel.mentions?.size}>
          <ContextMenuButton icon={MdMarkChatRead} onClick={markAsRead}>
            <Trans>Mark as read</Trans>
          </ContextMenuButton>
        </Show>
        <Show when={props.channel.havePermission("InviteOthers")}>
          <ContextMenuButton icon={MdGroupAdd} onClick={createInvite}>
            <Trans>Create invite</Trans>
          </ContextMenuButton>
        </Show>
        <ContextMenuDivider />
      </Show>

      <NotificationContextMenu channel={props.channel} />

      <ContextMenuDivider />

      <Show
        when={
          !props.inChannel &&
          props.channel.server?.havePermission("ManageChannel")
        }
      >
        <ContextMenuButton icon={MdLibraryAdd} onClick={createChannel}>
          <Trans>Create channel</Trans>
        </ContextMenuButton>
        <ContextMenuButton icon={MdLibraryAdd} onClick={createCategory}>
          <Trans>Create category</Trans>
        </ContextMenuButton>
      </Show>
      {/* also how phones, which can't drag, change a channel's category */}
      <Show
        when={
          props.channel.server?.havePermission("ManageChannel") &&
          props.channel.server.categories?.some((c) => c.id !== "default")
        }
      >
        <ContextMenuSubMenu
          icon={MdMoveToCategory}
          buttonContent={<Trans>Move to category</Trans>}
        >
          <For
            each={[
              { id: "default", title: undefined as string | undefined },
              ...props.channel.server!.categories!.filter(
                (category) => category.id !== "default",
              ),
            ]}
          >
            {(category) => (
              <ContextMenuButton
                onClick={() => moveTo(category.id)}
                actionSymbol={
                  categoryOf(
                    props.channel.server!.categories,
                    props.channel.id,
                  ) === category.id
                    ? MdRadioButtonChecked
                    : MdRadioButtonUnchecked
                }
              >
                {category.title ?? <Trans>No category</Trans>}
              </ContextMenuButton>
            )}
          </For>
        </ContextMenuSubMenu>
      </Show>
      <Show when={props.channel.havePermission("ManageChannel")}>
        <ContextMenuButton icon={MdSettings} onClick={editChannel}>
          <Trans>Open channel settings</Trans>
        </ContextMenuButton>
        <ContextMenuButton
          icon={props.channel.type === "Group" ? MdLogout : MdDelete}
          onClick={deleteChannel}
          destructive
        >
          <Switch fallback={<Trans>Delete channel</Trans>}>
            <Match when={props.channel.type === "Group"}>
              <Trans>Leave group</Trans>
            </Match>
          </Switch>
        </ContextMenuButton>
      </Show>

      <Show
        when={
          props.channel.server?.havePermission("ManageChannel") ||
          props.channel.havePermission("ManageChannel")
        }
      >
        <ContextMenuDivider />
      </Show>

      <Show when={state.settings.getValue("advanced:admin_panel")}>
        <ContextMenuButton icon={MdShield} onClick={openAdminPanel}>
          <Trans>Admin Panel</Trans>
        </ContextMenuButton>
      </Show>
      <ContextMenuButton icon={MdShare} onClick={copyLink}>
        <Trans>Copy link</Trans>
      </ContextMenuButton>
      <Show when={state.settings.getValue("advanced:copy_id")}>
        <ContextMenuButton icon={MdBadge} onClick={copyId}>
          <Trans>Copy channel ID</Trans>
        </ContextMenuButton>
      </Show>
    </ContextMenu>
  );
}
