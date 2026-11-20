import { createFormControl, createFormGroup } from "solid-forms";
import { For, Show, createSignal } from "solid-js";

import { Trans, useLingui } from "@lingui/solid/macro";

import { useNavigate } from "@revolt/routing";
import {
  Column,
  Dialog,
  DialogProps,
  FloatingSelect,
  Form2,
  MenuItem,
  Radio2,
} from "@revolt/ui";

import { moveChannelToCategory } from "../../../src/interface/navigation/channels/ordering";

import { useModals } from "..";
import { Modals } from "../types";

/**
 * Modal to create a new server channel
 */
export function CreateChannelModal(
  props: DialogProps & Modals & { type: "create_channel" },
) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const { showError } = useModals();

  const group = createFormGroup({
    name: createFormControl("", { required: true }),
    type: createFormControl("Text"),
  });

  // which category to put it in, "default" for none
  // eslint-disable-next-line solid/reactivity -- only the starting value
  const [category, setCategory] = createSignal(props.categoryId ?? "default");
  const categories = () =>
    props.server.categories?.filter((category) => category.id !== "default") ??
    [];

  async function onSubmit() {
    try {
      const type = group.controls.type.value as "Text" | "Voice" | "Panel";
      const channel = await props.server.createChannel({
        type: type === "Panel" ? "Text" : type,
        name: group.controls.name.value,
        // Panel rooms are text channels marked through their description
        ...(type === "Panel" ? { description: "[panel]" } : {}),
      });

      // Put it in the chosen category
      const newChId = channel.id,
        catId = category();
      if (catId !== "default") {
        const known = props.server.channels.map((ch) => ch.id);
        if (!known.includes(newChId)) known.push(newChId);
        await props.server.edit({
          categories: moveChannelToCategory(
            props.server.categories,
            known,
            newChId,
            catId,
          ),
        });
      }

      if (props.cb) {
        props.cb(channel);
      } else {
        navigate(`/server/${props.server.id}/channel/${newChId}`);
      }

      props.onClose();
    } catch (error) {
      showError(error);
    }
  }

  const submit = Form2.useSubmitHandler(group, onSubmit);

  return (
    <Dialog
      show={props.show}
      onClose={props.onClose}
      title={<Trans>Create channel</Trans>}
      actions={[
        { text: <Trans>Close</Trans> },
        {
          text: <Trans>Create</Trans>,
          onClick: () => {
            onSubmit();
            return false;
          },
          isDisabled: !Form2.canSubmit(group),
        },
      ]}
      isDisabled={group.isPending}
    >
      <form onSubmit={submit}>
        <Column>
          <Form2.TextField
            minlength={1}
            maxlength={32}
            counter
            name="name"
            control={group.controls.name}
            label={t`Channel Name`}
          />

          <Form2.Radio control={group.controls.type}>
            <Radio2.Option value="Text">
              <Trans>Text Channel</Trans>
            </Radio2.Option>
            <Radio2.Option value="Voice">
              <Trans>Voice Channel</Trans>
            </Radio2.Option>
            <Radio2.Option value="Panel">
              <Trans>Panel</Trans>
            </Radio2.Option>
          </Form2.Radio>

          <Show when={categories().length}>
            <FloatingSelect
              label={t`Category`}
              value={category()}
              onChange={(e) => setCategory(e.currentTarget.value ?? "default")}
            >
              <MenuItem value="default">
                <Trans>No category</Trans>
              </MenuItem>
              <For each={categories()}>
                {(entry) => <MenuItem value={entry.id}>{entry.title}</MenuItem>}
              </For>
            </FloatingSelect>
          </Show>
        </Column>
      </form>
    </Dialog>
  );
}
