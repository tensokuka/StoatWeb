import { useFloating } from "solid-floating-ui";
import {
  Component,
  ComponentProps,
  createSignal,
  getOwner,
  JSX,
  runWithOwner,
  Show,
  splitProps,
} from "solid-js";
import { Portal } from "solid-js/web";
import { Motion, Presence } from "solid-motionone";

import { autoUpdate, flip, offset, shift } from "@floating-ui/dom";
import { styled } from "styled-system/jsx";

import { iconSize, symbolSize, Text, useMenuSheet } from "@revolt/ui";
import { fitToViewport } from "@revolt/ui/components/floating/fitToViewport";

import MdChevronRight from "@material-design-icons/svg/outlined/chevron_right.svg?component-solid";

const Base = styled("div", {
  base: {
    display: "flex",
    flexDirection: "column",
    padding: "var(--gap-md) 0",
    overflow: "hidden",
    borderRadius: "var(--borderRadius-xs)",
    background: "var(--md-sys-color-surface-container)",
    color: "var(--md-sys-color-on-surface)",
    fill: "var(--md-sys-color-on-surface)",
    boxShadow: "0 0 3px var(--md-sys-color-shadow)",

    userSelect: "none",
  },
  variants: {
    // in a phone bottom sheet, which provides the surface and scrolling
    sheet: {
      true: {
        padding: 0,
        overflow: "visible",
        borderRadius: 0,
        background: "transparent",
        boxShadow: "none",
      },
    },
  },
});

export function ContextMenu(props: ComponentProps<typeof Base>) {
  const sheet = useMenuSheet();

  return (
    <Base
      sheet={!!sheet}
      // prevent context menu closing itself before click event
      onpointerdown={(e) => e.stopImmediatePropagation()}
      {...props}
    />
  );
}

export const ContextMenuDivider = styled("div", {
  base: {
    height: "1px",
    margin: "var(--gap-sm) 0",
    background: "var(--md-sys-color-outline-variant)",
  },
});

export const ContextMenuItem = styled("a", {
  base: {
    display: "flex",
    gap: "var(--gap-md)",
    alignItems: "center",
    padding: "var(--gap-md) var(--gap-lg)",

    _coarse: {
      minHeight: "48px",
    },

    "&:hover": {
      background:
        "color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent)",
    },

    // let the label fill the row, but not <Symbol> icons (also spans)
    "& span:not([aria-hidden='true'])": {
      flexGrow: 1,
    },
  },
  variants: {
    selected: {
      true: {
        background:
          "color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent)",
      },
      false: {},
    },
    action: {
      true: {
        cursor: "pointer",
      },
    },
    button: {
      true: {
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: "var(--gap-md)",
        "& span": {
          marginTop: "1px",
        },
      },
    },
    _titleCase: {
      true: {},
      false: {},
    },
    destructive: {
      true: {
        fill: "var(--md-sys-color-error)",
        color: "var(--md-sys-color-error)",
      },
    },
  },
  defaultVariants: {
    _titleCase: true,
    selected: false,
  },
  compoundVariants: [
    {
      _titleCase: true,
      button: true,
      css: {
        textTransform: "capitalize",
      },
    },
  ],
});

type ButtonProps = ComponentProps<typeof ContextMenuItem> & {
  icon?: JSX.Element | Component<JSX.SvgSVGAttributes<SVGSVGElement>>;
  symbol?: JSX.Element | Component<JSX.SvgSVGAttributes<SVGSVGElement>>;
  destructive?: boolean;
  actionIcon?: JSX.Element | Component<JSX.SvgSVGAttributes<SVGSVGElement>>;
  actionSymbol?: JSX.Element | Component<JSX.SvgSVGAttributes<SVGSVGElement>>;
};

export function ContextMenuButton(props: ButtonProps) {
  const [local, remote] = splitProps(props, [
    "icon",
    "symbol",
    "actionIcon",
    "actionSymbol",
    "children",
  ]);

  // bigger icons for the large rows of a phone sheet
  const size = useMenuSheet() ? 22 : 16;

  return (
    <ContextMenuItem button {...remote}>
      {typeof local.icon === "function"
        ? local.icon?.(iconSize(size))
        : local.icon}
      {typeof local.symbol === "function"
        ? local.symbol(symbolSize(size))
        : local.symbol}
      <Text>{local.children}</Text>
      {typeof local.actionIcon === "function"
        ? local.actionIcon?.(iconSize(20))
        : local.actionIcon}
      {typeof local.actionSymbol === "function"
        ? local.actionSymbol(symbolSize(20))
        : local.actionSymbol}
    </ContextMenuItem>
  );
}

export function ContextMenuSubMenu(
  props: Omit<
    ButtonProps,
    "ref" | "onClick" | "onPointerEnter" | "onMouseLeave"
  > & {
    buttonContent: JSX.Element;
    onClick?: () => void;
  },
) {
  const [anchor, setAnchor] = createSignal<HTMLDivElement>();
  const [ref, setRef] = createSignal<HTMLDivElement>();
  const sheet = useMenuSheet();
  // the page is built from a tap handler, so give it this menu's context
  // (translations and the like)
  const owner = getOwner();

  const [show, setShow] = createSignal<"hide" | "show" | boolean>(false);
  const [local, buttonProps] = splitProps(props, [
    "children",
    "buttonContent",
    "onClick",
  ]);

  function isShowing() {
    return show() === true || show() === "show";
  }

  const position = useFloating(anchor, ref, {
    placement: "right-start",
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(5),
      // phones rarely have room to the right of the parent menu, so try the
      // left, then below / above the row (covering the parent) before giving up
      flip({
        padding: 8,
        fallbackPlacements: ["left-start", "bottom-start", "top-start"],
      }),
      shift({ padding: 8, crossAxis: true }),
      // size the menu itself, not the wrapper which also holds the hover bridge
      fitToViewport(8, (floating) => floating.lastElementChild as HTMLElement),
    ],
  });

  return (
    <>
      <ContextMenuButton
        ref={setAnchor}
        selected={isShowing()}
        actionIcon={MdChevronRight}
        onpointerdown={(e) => {
          e.stopImmediatePropagation();
        }}
        onClick={(e) => {
          if (local.onClick) {
            local.onClick();
          } else if (sheet) {
            // on phones the submenu replaces the menu, with a way back
            e.stopImmediatePropagation();
            sheet.openPage(
              // eslint-disable-next-line solid/reactivity -- read when the page renders
              () => runWithOwner(owner, () => local.buttonContent),
              () =>
                runWithOwner(owner, () => (
                  <ContextMenu>{local.children}</ContextMenu>
                )),
            );
          } else {
            e.stopImmediatePropagation();
            setShow(isShowing() ? false : "show");
          }
        }}
        // Touch sends a compatibility hover right before the click, which would
        // open the submenu only for the click handler to close it again
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") {
            setShow((show) => (show === "hide" ? show : true));
          }
        }}
        {...buttonProps}
      >
        {local.buttonContent}
      </ContextMenuButton>
      <Portal mount={document.getElementById("floating")!}>
        <Presence>
          {/* the sheet shows submenus itself */}
          <Show when={!sheet && isShowing()}>
            <Motion
              ref={setRef}
              style={{
                position: position.strategy,
                top: `${position.y ?? 0}px`,
                left: `${position.x ?? 0}px`,
                "z-index": 1000,
              }}
              initial={{ opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, easing: [0.87, 0, 0.13, 1] }}
              onMouseLeave={() =>
                setShow((show) => (show === true ? false : show))
              }
              // stop submenu from closing context menu
              onpointerdown={(e) => e.stopImmediatePropagation()}
            >
              <div
                onClick={(e) => {
                  if (local.onClick) {
                    local.onClick();
                  } else {
                    // prevent submenu trigger from closing context menu
                    e.stopImmediatePropagation();
                    setShow((show) => (show ? "hide" : true));
                  }
                }}
                // float a virtual element to ensure the mouseLeave event covers
                // both the anchor/button we attached to and the newly created context menu
                style={{
                  position: "fixed",
                  top: 0,
                  left: `-${(anchor()?.clientWidth ?? 0) + 5}px`,
                  width: `${(anchor()?.clientWidth ?? 0) + 5}px`,
                  height: `${anchor()?.clientHeight ?? 0}px`,
                  cursor: "pointer",
                }}
              />
              <ContextMenu>{local.children}</ContextMenu>
            </Motion>
          </Show>
        </Presence>
      </Portal>
    </>
  );
}
