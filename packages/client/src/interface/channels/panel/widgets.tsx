import {
  Component,
  For,
  Match,
  Show,
  Switch,
  createEffect,
  createResource,
  createSignal,
  onCleanup,
} from "solid-js";
import { createStore } from "solid-js/store";

import { Trans, useLingui } from "@lingui/solid/macro";
import { styled } from "styled-system/jsx";

import { isAllowedIframeSrc } from "@revolt/common";
import { Markdown } from "@revolt/markdown";
import {
  Button,
  CircularProgress,
  Column,
  Text,
  TextField,
  useSnackbar,
} from "@revolt/ui";

import { PanelBridge } from "./bridge";
import {
  ButtonWidget,
  FormWidget,
  IframeWidget,
  MarkdownWidget,
  PanelWidget,
  StatusWidget,
  UnknownWidget,
} from "./manifest";

export interface WidgetProps<T extends PanelWidget = PanelWidget> {
  widget: T;
  bridge: PanelBridge;
}

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/**
 * Runs an action, optionally asking for a second click first
 */
function ButtonView(props: WidgetProps<ButtonWidget>) {
  const snackbar = useSnackbar();
  const [busy, setBusy] = createSignal(false);
  const [armed, setArmed] = createSignal(false);

  let disarmTimer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(disarmTimer));

  async function run() {
    if (props.widget.confirm && !armed()) {
      setArmed(true);
      disarmTimer = setTimeout(() => setArmed(false), 4000);
      return;
    }

    clearTimeout(disarmTimer);
    setArmed(false);
    setBusy(true);

    try {
      const result = await props.bridge.action(
        props.widget.action,
        props.widget.params,
      );
      snackbar.show({ message: result.message ?? `${props.widget.label}: OK` });
    } catch (error) {
      snackbar.show({
        message: `${props.widget.label}: ${errorMessage(error)}`,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant={armed() ? "_error" : "filled"}
      isDisabled={busy()}
      onPress={run}
    >
      {armed() ? props.widget.confirm : props.widget.label}
    </Button>
  );
}

/**
 * Render arbitrary JSON from a status source
 */
function DataView(props: { value: unknown }) {
  const format = (value: unknown) =>
    typeof value === "object" && value !== null
      ? JSON.stringify(value)
      : String(value);

  return (
    <Switch fallback={<Text class="body">{format(props.value)}</Text>}>
      <Match when={Array.isArray(props.value)}>
        <Show
          when={(props.value as unknown[]).length}
          fallback={
            <Text class="body">
              <Trans>Nothing to show</Trans>
            </Text>
          }
        >
          <List>
            <For each={props.value as unknown[]}>
              {(item) => <li>{format(item)}</li>}
            </For>
          </List>
        </Show>
      </Match>
      <Match when={typeof props.value === "object" && props.value !== null}>
        <Pairs>
          <For each={Object.entries(props.value as Record<string, unknown>)}>
            {([key, value]) => (
              <>
                <dt>{key}</dt>
                <dd>{format(value)}</dd>
              </>
            )}
          </For>
        </Pairs>
      </Match>
    </Switch>
  );
}

/**
 * Polls a bridge source and displays the result
 */
function StatusView(props: WidgetProps<StatusWidget>) {
  const [data, { refetch }] = createResource(
    () => props.widget.source,
    (source) => props.bridge.source(source),
  );

  createEffect(() => {
    if (props.widget.refresh <= 0) return;
    const interval = setInterval(refetch, props.widget.refresh * 1000);
    onCleanup(() => clearInterval(interval));
  });

  return (
    <Switch fallback={<DataView value={data.latest} />}>
      <Match when={data.error}>
        <ErrorText>{errorMessage(data.error)}</ErrorText>
      </Match>
      <Match when={data.latest === undefined}>
        <CircularProgress />
      </Match>
    </Switch>
  );
}

/**
 * Collects input and submits it as action parameters
 */
function FormView(props: WidgetProps<FormWidget>) {
  const { t } = useLingui();
  const snackbar = useSnackbar();
  const [values, setValues] = createStore<Record<string, string>>({});
  const [busy, setBusy] = createSignal(false);

  const canSubmit = () =>
    !busy() &&
    props.widget.fields.every((field) => !field.required || values[field.name]);

  async function submit() {
    if (!canSubmit()) return;
    setBusy(true);

    const params: Record<string, unknown> = {};
    for (const field of props.widget.fields) {
      const value = values[field.name] ?? "";
      params[field.name] = field.kind === "number" ? Number(value) : value;
    }

    try {
      const result = await props.bridge.action(props.widget.action, params);
      snackbar.show({ message: result.message ?? t`Submitted` });
      setValues({});
    } catch (error) {
      snackbar.show({ message: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Column>
        <For each={props.widget.fields}>
          {(field) => (
            <TextField
              type={field.kind}
              label={field.label ?? field.name}
              placeholder={field.placeholder}
              required={field.required}
              value={values[field.name] ?? ""}
              onChange={(e) => setValues(field.name, e.currentTarget.value)}
            />
          )}
        </For>
        <Button variant="filled" isDisabled={!canSubmit()} onPress={submit}>
          {props.widget.submitLabel ?? t`Submit`}
        </Button>
      </Column>
    </form>
  );
}

/**
 * Embeds an allowlisted page
 */
function IframeView(props: WidgetProps<IframeWidget>) {
  return (
    <Show
      when={isAllowedIframeSrc(props.widget.src)}
      fallback={
        <ErrorText>
          <Trans>
            This origin is not in VITE_PANEL_IFRAME_ORIGINS: {props.widget.src}
          </Trans>
        </ErrorText>
      }
    >
      <Frame
        src={props.widget.src}
        title={props.widget.title ?? props.widget.id}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        referrerPolicy="no-referrer"
      />
    </Show>
  );
}

function MarkdownView(props: WidgetProps<MarkdownWidget>) {
  return <Markdown content={props.widget.content} />;
}

function UnknownView(props: WidgetProps<UnknownWidget>) {
  return (
    <ErrorText>
      <Trans>Unsupported widget type "{props.widget.originalType}"</Trans>
    </ErrorText>
  );
}

/**
 * Widget type to component mapping, add new widgets here
 */
export const WIDGETS: {
  [K in PanelWidget["type"]]: Component<
    WidgetProps<Extract<PanelWidget, { type: K }>>
  >;
} = {
  button: ButtonView,
  status: StatusView,
  form: FormView,
  iframe: IframeView,
  markdown: MarkdownView,
  unknown: UnknownView,
};

const ErrorText = styled("span", {
  base: {
    color: "var(--md-sys-color-error)",
  },
});

const List = styled("ul", {
  base: {
    margin: 0,
    paddingInlineStart: "1.2em",
    overflowWrap: "anywhere",
  },
});

const Pairs = styled("dl", {
  base: {
    margin: 0,
    display: "grid",
    gridTemplateColumns: "auto 1fr",
    gap: "4px 12px",
    overflowWrap: "anywhere",

    "& dt": {
      color: "var(--md-sys-color-on-surface-variant)",
    },
    "& dd": {
      margin: 0,
    },
  },
});

const Frame = styled("iframe", {
  base: {
    width: "100%",
    height: "100%",
    minHeight: "120px",
    border: "none",
    borderRadius: "var(--borderRadius-md)",
  },
});
