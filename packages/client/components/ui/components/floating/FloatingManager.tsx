/* eslint-disable solid/reactivity */
import { useFloating } from "solid-floating-ui";
import {
  For,
  Match,
  Show,
  Switch,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import { Portal } from "solid-js/web";

import { autoUpdate, flip, offset, shift } from "@floating-ui/dom";

import { fitToViewport } from "./fitToViewport";

import { useDevice } from "@revolt/common";
import { Keybind, KeybindAction } from "@revolt/keybinds";

import { FloatingElement, floatingElements } from "../../directives";

import { dismissFloatingElements } from ".";
import { AutoComplete } from "./AutoComplete";
import { MenuSheet } from "./MenuSheet";
import { TooltipBase } from "./Tooltip";
import { UserCard } from "./UserCard";

/**
 * Render the actual floating elements
 */
export function FloatingManager() {
  let mouseX = 0,
    mouseY = 0;

  /**
   * Keep track of last mouse position at all times
   */
  function onMouseMove({ clientX, clientY }: PointerEvent) {
    mouseX = clientX;
    mouseY = clientY;
  }

  onMount(() => {
    document.addEventListener("pointermove", onMouseMove);
    document.addEventListener("pointerdown", onMouseMove);
  });
  onCleanup(() => {
    document.removeEventListener("pointermove", onMouseMove);
    document.removeEventListener("pointerdown", onMouseMove);
  });

  // On phones, context menus open as a bottom sheet
  const { layout } = useDevice();
  const sheetMenus = () => layout() === "phone";

  /**
   * Only the open ones are rendered, not a component for every trigger on
   * screen (P4)
   */
  const open = createMemo(() => floatingElements().filter((el) => el.show()));

  /**
   * Whether a floating element is visible
   */
  function anyVisible() {
    return open().length > 0;
  }

  return (
    <Portal mount={document.getElementById("floating")!}>
      <For each={open()}>
        {(element) => (
          <Show
            when={sheetMenus() && element.show()?.contextMenu}
            fallback={<Floating {...element} mouseX={mouseX} mouseY={mouseY} />}
          >
            <SheetMenu {...element} />
          </Show>
        )}
      </For>

      <Show when={anyVisible()}>
        <Keybind
          keybind={KeybindAction.CLOSE_FLOATING}
          onPressed={dismissFloatingElements}
        />
      </Show>
    </Portal>
  );
}

/**
 * Render a context menu as a bottom sheet
 */
function SheetMenu(props: FloatingElement) {
  /**
   * Choosing an item closes the menu, as on desktop
   */
  function onClick() {
    if (props.show()?.contextMenu) props.hide();
  }

  onMount(() => document.addEventListener("click", onClick));
  onCleanup(() => document.removeEventListener("click", onClick));

  /**
   * Other code dismisses menus with a synthetic pointerdown
   */
  function onPointerDown(e: Event) {
    if (!e.defaultPrevented && !(e instanceof PointerEvent)) props.hide();
  }

  onMount(() => document.addEventListener("pointerdown", onPointerDown));
  onCleanup(() => document.removeEventListener("pointerdown", onPointerDown));

  return (
    <MenuSheet onClose={props.hide}>{props.show()!.contextMenu!({})}</MenuSheet>
  );
}

/**
 * Render a floating element
 */
function Floating(props: FloatingElement & { mouseX: number; mouseY: number }) {
  const [floating, setFloating] = createSignal<HTMLDivElement>();

  /**
   * Figure out placement of the floating element
   */
  const placement = () => {
    const current = props.show();
    if (!current) return;

    if (current.tooltip) {
      return current.tooltip.placement;
    } else if (current.userCard) {
      return "right-start";
    } else if (current.contextMenu) {
      return "right-start";
    } else if (current.autoComplete) {
      return "top-start";
    }
  };

  /**
   * Determine element to provide
   */
  const element = () => {
    const current = props.show();

    if (current?.contextMenu) {
      return {
        /**
         * Determine client rectangle for virtual element
         */
        getBoundingClientRect() {
          return {
            width: 0,
            height: 0,
            x: props.mouseX,
            y: props.mouseY,
            left: props.mouseX,
            right: props.mouseX,
            top: props.mouseY,
            bottom: props.mouseY,
          };
        },
      };
    } else {
      return props.element;
    }
  };

  const position = useFloating(element, floating, {
    placement: placement(),
    middleware: props.show()?.contextMenu
      ? // keep long menus on screen: cap to the viewport and scroll inside
        [
          offset(5),
          flip({ padding: 8 }),
          shift({ padding: 8 }),
          fitToViewport(),
        ]
      : [offset(5), flip(), shift()],
    // context menus are re-positioned too, so content rendering after
    // opening or the phone rotating doesn't leave them off screen
    whileElementsMounted:
      props.show()?.tooltip ||
      props.show()?.autoComplete ||
      props.show()?.contextMenu
        ? autoUpdate
        : undefined,
  });

  /**
   * Dismiss floating element when clicking elsewhere
   */
  function onMouseDown(e: PointerEvent) {
    if (!e.defaultPrevented) {
      const currentlyShown = props.show();
      if (!currentlyShown?.contextMenu && !currentlyShown?.userCard) return;

      props.hide();
    }
  }

  if (props.config().contextMenu || props.config().userCard) {
    onMount(() => document.addEventListener("pointerdown", onMouseDown));
    onCleanup(() => document.removeEventListener("pointerdown", onMouseDown));
  }

  /**
   * Always dismiss context menu on click
   */
  function onClick() {
    const currentlyShown = props.show();
    if (!currentlyShown?.contextMenu) return;

    props.hide();
  }

  if (props.config().contextMenu) {
    onMount(() => document.addEventListener("click", onClick));
    onCleanup(() => document.removeEventListener("click", onClick));
  }

  return (
    <div
      ref={setFloating}
      use:motion={{
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        transition: { duration: 0.1, easing: [0.87, 0, 0.13, 1] },
      }}
      style={{
        position: position.strategy,
        top: `${position.y ?? 0}px`,
        left: `${position.x ?? 0}px`,
        "z-index": props.show()?.userCard ? "99" : "999",
      }}
    >
      <Switch>
        <Match when={props.show()?.tooltip}>
          <TooltipBase>
            {typeof props.show()!.tooltip!.content === "function"
              ? (props.show()!.tooltip!.content as (arg1: object) => void)({})
              : props.show()!.tooltip!.content}
          </TooltipBase>
        </Match>
        <Match when={props.show()?.userCard}>
          <UserCard
            user={props.show()!.userCard!.user}
            member={props.show()!.userCard!.member}
            bot={props.show()!.userCard!.bot}
            onClose={props.hide}
          />
        </Match>
        <Match when={props.show()?.contextMenu}>
          {props.show()!.contextMenu!({})}
        </Match>
        <Match when={props.show()?.autoComplete}>
          <AutoComplete {...props.show()!.autoComplete!} />
        </Match>
      </Switch>
    </div>
  );
}
