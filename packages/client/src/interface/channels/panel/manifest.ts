/**
 * Fields shared by every widget
 */
interface WidgetBase {
  /**
   * Unique identifier within the manifest
   */
  id: string;

  /**
   * Optional heading shown above the widget
   */
  title?: string;

  /**
   * Columns spanned
   */
  w: number;

  /**
   * Rows spanned
   */
  h: number;
}

export interface ButtonWidget extends WidgetBase {
  type: "button";
  label: string;
  action: string;
  params?: Record<string, unknown>;
  /**
   * Ask for a second click before running the action
   */
  confirm?: string;
}

export interface StatusWidget extends WidgetBase {
  type: "status";
  source: string;
  /**
   * Refresh interval in seconds, 0 to disable
   */
  refresh: number;
}

export interface FormField {
  name: string;
  label?: string;
  kind: "text" | "number" | "password";
  placeholder?: string;
  required?: boolean;
}

export interface FormWidget extends WidgetBase {
  type: "form";
  action: string;
  fields: FormField[];
  submitLabel?: string;
}

export interface IframeWidget extends WidgetBase {
  type: "iframe";
  src: string;
}

export interface MarkdownWidget extends WidgetBase {
  type: "markdown";
  content: string;
}

export interface UnknownWidget extends WidgetBase {
  type: "unknown";
  originalType: string;
}

export type PanelWidget =
  | ButtonWidget
  | StatusWidget
  | FormWidget
  | IframeWidget
  | MarkdownWidget
  | UnknownWidget;

export interface PanelManifest {
  version: 1;
  title?: string;
  columns: number;
  widgets: PanelWidget[];
}

const DEFAULT_COLUMNS = 12;
const FIELD_KINDS = ["text", "number", "password"] as const;

type Obj = Record<string, unknown>;

const isObj = (value: unknown): value is Obj =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const str = (value: unknown) => (typeof value === "string" ? value : undefined);

function requireStr(obj: Obj, key: string, ctx: string): string {
  const value = str(obj[key]);
  if (!value) throw new Error(`${ctx}: "${key}" must be a non-empty string`);
  return value;
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function parseField(input: unknown, ctx: string): FormField {
  if (!isObj(input)) throw new Error(`${ctx}: field must be an object`);

  const kind = str(input.kind) ?? "text";
  if (!(FIELD_KINDS as readonly string[]).includes(kind))
    throw new Error(`${ctx}: unsupported field kind "${kind}"`);

  return {
    name: requireStr(input, "name", ctx),
    label: str(input.label),
    kind: kind as FormField["kind"],
    placeholder: str(input.placeholder),
    required: input.required === true,
  };
}

function parseWidget(input: unknown, index: number, columns: number) {
  if (!isObj(input)) throw new Error(`widgets[${index}] must be an object`);

  const ctx = `widgets[${index}]`;
  const base: WidgetBase = {
    id: str(input.id) ?? `widget-${index}`,
    title: str(input.title),
    w: clampInt(input.w, 1, columns, columns),
    h: clampInt(input.h, 1, 24, 1),
  };

  const type = str(input.type) ?? "";
  switch (type) {
    case "button":
      return {
        ...base,
        type,
        label: str(input.label) ?? base.title ?? "Run",
        action: requireStr(input, "action", ctx),
        params: isObj(input.params) ? input.params : undefined,
        confirm: str(input.confirm),
      } satisfies ButtonWidget;
    case "status":
      return {
        ...base,
        type,
        source: requireStr(input, "source", ctx),
        refresh: clampInt(input.refresh, 0, 86400, 0),
      } satisfies StatusWidget;
    case "form":
      if (!Array.isArray(input.fields))
        throw new Error(`${ctx}: "fields" must be an array`);
      return {
        ...base,
        type,
        action: requireStr(input, "action", ctx),
        fields: input.fields.map((field, i) =>
          parseField(field, `${ctx}.fields[${i}]`),
        ),
        submitLabel: str(input.submitLabel),
      } satisfies FormWidget;
    case "iframe":
      return {
        ...base,
        type,
        src: requireStr(input, "src", ctx),
      } satisfies IframeWidget;
    case "markdown":
      return {
        ...base,
        type,
        content: str(input.content) ?? "",
      } satisfies MarkdownWidget;
    default:
      return {
        ...base,
        type: "unknown",
        originalType: type,
      } satisfies UnknownWidget;
  }
}

/**
 * Validate and normalise a manifest served by a panel bridge
 * @param input Parsed JSON
 * @throws Error describing the first problem found
 */
export function parseManifest(input: unknown): PanelManifest {
  if (!isObj(input)) throw new Error("Manifest must be an object");
  if (input.version !== 1)
    throw new Error(`Unsupported manifest version: ${String(input.version)}`);
  if (!Array.isArray(input.widgets))
    throw new Error('Manifest "widgets" must be an array');

  const columns = clampInt(input.columns, 1, 24, DEFAULT_COLUMNS);

  return {
    version: 1,
    title: str(input.title),
    columns,
    widgets: input.widgets.map((widget, i) => parseWidget(widget, i, columns)),
  };
}
