import { useBackHandler, useDevice } from "@revolt/common";
import {
  type Accessor,
  type JSX,
  createEffect,
  createSignal,
  on,
  onCleanup,
} from "solid-js";

import { addLongPressListener } from "./longPress";
import { addPressFeedback, longPressVibrate } from "./pressFeedback";

type Props = JSX.Directives["floating"] & object;

export type FloatingElement = {
  config: () => Props;
  element: HTMLElement;
  hide: () => void;
  show: Accessor<Props | undefined>;
};

const [floatingElements, setFloatingElements] = createSignal<FloatingElement[]>(
  [],
);

export { floatingElements };

/**
 * Register a new floating element
 * @param element element
 */
export function registerFloatingElement(element: FloatingElement) {
  setFloatingElements((elements) => [...elements, element]);
}

/**
 * Un register floating element
 * @param element DOM Element
 */
export function unregisterFloatingElement(element: HTMLElement) {
  setFloatingElements((elements) =>
    elements.filter((entry) => entry.element !== element),
  );
}

/**
 * Add floating elements
 * @param element Element
 * @param accessor Parameters
 */
export function floating(element: HTMLElement, accessor: Accessor<Props>) {
  if (!accessor()) return;

  const { isIOSTouch } = useDevice();

  const [show, setShow] = createSignal<Props | undefined>();
  // DEBUG: createEffect(() => console.info("show:", show()));

  registerFloatingElement({
    config: accessor,
    element,
    show,
    /**
     * Hide the element
     */
    hide() {
      setShow(undefined);
    },
  });

  // Back closes menus and user cards
  useBackHandler(
    () => !!(show()?.contextMenu || show()?.userCard),
    () => setShow(undefined),
  );

  /**
   * Trigger a floating element
   */
  function trigger(target: keyof Props, desiredState?: boolean) {
    const current = show();
    const config = accessor();

    if (target === "userCard" && config.userCard) {
      if (current?.userCard) {
        setShow(undefined);
      } else if (!current) {
        setShow({ userCard: config.userCard });
      } else {
        setShow(undefined);
        setShow({ userCard: config.userCard });
      }
    }

    if (target === "tooltip" && config.tooltip) {
      if (current?.tooltip) {
        if (desiredState !== true) {
          setShow(undefined);
        }
      } else if (!current) {
        if (desiredState !== false) {
          setShow({ tooltip: config.tooltip });
        }
      }
    }

    if (target === "contextMenu" && config.contextMenu) {
      if (current?.contextMenu) {
        setShow(undefined);
      } else if (!current) {
        setShow({ contextMenu: config.contextMenu });
      } else {
        setShow(undefined);
        setShow({ contextMenu: config.contextMenu });
      }
    }
  }

  /**
   * Handle click events
   */
  function onClick() {
    // TODO: handle shift+click for mention
    trigger("userCard");
  }

  /**
   * Handle context menu click
   */
  function onContextMenu(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    if ((event as PointerEvent).pointerType === "touch" && !show()) {
      longPressVibrate();
    }

    trigger("contextMenu");
  }

  /**
   * Handle pointer entering
   *
   * Touch is ignored, iOS sends a compatibility mouseenter after a tap
   * that never gets a matching mouseleave, leaving the tooltip stuck open
   */
  function onPointerEnter(event: PointerEvent) {
    if (event.pointerType !== "touch") trigger("tooltip", true);
  }

  /**
   * Handle pointer leaving
   */
  function onPointerLeave() {
    trigger("tooltip", false);
  }

  createEffect(
    on(
      () => accessor().userCard,
      (userCard) => {
        if (userCard) {
          element.style.cursor = "pointer";
          element.style.userSelect = "none";
          element.addEventListener("click", onClick);

          onCleanup(() => element.removeEventListener("click", onClick));
        }
      },
    ),
  );

  createEffect(
    on(
      () => accessor().tooltip,
      (tooltip) => {
        if (tooltip) {
          element.ariaLabel =
            typeof tooltip.content === "string"
              ? tooltip.content
              : tooltip!.aria!;

          element.addEventListener("pointerenter", onPointerEnter);
          element.addEventListener("pointerleave", onPointerLeave);

          onCleanup(() => {
            element.removeEventListener("pointerenter", onPointerEnter);
            element.removeEventListener("pointerleave", onPointerLeave);
          });
        }
      },
    ),
  );

  createEffect(
    on(
      () => accessor().contextMenu,
      (contextMenu) => {
        if (contextMenu) {
          const handler = accessor().contextMenuHandler ?? "contextmenu";

          element.addEventListener(handler, onContextMenu);
          onCleanup(() => element.removeEventListener(handler, onContextMenu));

          if (handler === "contextmenu") {
            // iOS Safari never fires contextmenu for touch, so emulate it with a long press
            if (isIOSTouch) {
              onCleanup(addLongPressListener(element, onContextMenu));
            }

            // Show the press straight away, and keep iOS's own link and
            // image callout from appearing next to our menu
            element.dataset.longPress = "";
            onCleanup(addPressFeedback(element));
            onCleanup(() => delete element.dataset.longPress);
          }
        }
      },
    ),
  );

  onCleanup(() => unregisterFloatingElement(element));
}
