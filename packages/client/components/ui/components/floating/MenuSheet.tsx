import { JSX, Show, createContext, createSignal, useContext } from "solid-js";
import { Motion } from "solid-motionone";

import { useLingui } from "@lingui/solid/macro";
import { css } from "styled-system/css";
import { styled } from "styled-system/jsx";

import { useBackHandler } from "@revolt/common";

import MdArrowBack from "@material-design-icons/svg/outlined/arrow_back.svg?component-solid";

interface SheetPage {
  title: () => JSX.Element;
  content: () => JSX.Element;
}

export interface MenuSheetApi {
  /** Show a submenu as a page in the sheet, with a back row */
  openPage(title: () => JSX.Element, content: () => JSX.Element): void;
}

const MenuSheetContext = createContext<MenuSheetApi>();

/**
 * Inside a phone menu sheet, for menus to lay themselves out for it
 */
export function useMenuSheet() {
  return useContext(MenuSheetContext);
}

/**
 * On phones, context menus open as a sheet from the bottom of the screen
 * with large rows. Submenus open as pages inside it.
 */
export function MenuSheet(props: {
  children: JSX.Element;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const [pages, setPages] = createSignal<SheetPage[]>([]);
  const top = () => pages().at(-1);
  const popPage = () => setPages((pages) => pages.slice(0, -1));

  // Back leaves a submenu page before closing the whole sheet
  useBackHandler(() => pages().length > 0, popPage);

  const api: MenuSheetApi = {
    openPage: (title, content) =>
      setPages((pages) => [...pages, { title, content }]),
  };

  return (
    <MenuSheetContext.Provider value={api}>
      {/* one root: the Presence around floating elements takes one child */}
      <div>
        <Motion.div
          class={scrim}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15 }}
          // close on the tap's click, not its pointerdown, so the click can't
          // land on whatever was under the scrim once it's gone
          onpointerdown={(e) => e.stopImmediatePropagation()}
          onClick={(e) => {
            e.stopImmediatePropagation();
            props.onClose();
          }}
        />
        <Motion.div
          class={sheet}
          role="menu"
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          transition={{ duration: 0.2, easing: [0.2, 0, 0, 1] }}
          onpointerdown={(e) => e.stopImmediatePropagation()}
        >
          <Handle
            aria-hidden="true"
            onClick={(e) => e.stopImmediatePropagation()}
          />
          {/* kept mounted so the menu doesn't rebuild when leaving a page */}
          <div style={{ display: top() ? "none" : undefined }}>
            {props.children}
          </div>
          <Show when={top()} keyed>
            {(page) => (
              <>
                <BackRow
                  type="button"
                  aria-label={t`Back`}
                  onClick={(e) => {
                    e.stopImmediatePropagation();
                    popPage();
                  }}
                >
                  <MdArrowBack width={22} height={22} />
                  <span>{page.title()}</span>
                </BackRow>
                {page.content()}
              </>
            )}
          </Show>
        </Motion.div>
      </div>
    </MenuSheetContext.Provider>
  );
}

const scrim = css({
  position: "fixed",
  inset: 0,
  zIndex: 998,
  background: "rgba(0, 0, 0, 0.4)",
});

const sheet = css({
  position: "fixed",
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 999,
  maxHeight: "calc(100dvh - env(safe-area-inset-top, 0px) - 48px)",
  overflowY: "auto",
  overscrollBehavior: "contain",
  paddingBottom: "calc(var(--gap-md) + env(safe-area-inset-bottom, 0px))",
  borderTopLeftRadius: "var(--borderRadius-xl)",
  borderTopRightRadius: "var(--borderRadius-xl)",
  background: "var(--md-sys-color-surface-container-low)",
  color: "var(--md-sys-color-on-surface)",
  fill: "var(--md-sys-color-on-surface)",
  boxShadow: "0 -2px 8px var(--md-sys-color-shadow)",
  userSelect: "none",
});

const Handle = styled("div", {
  base: {
    width: "32px",
    height: "4px",
    margin: "var(--gap-md) auto",
    borderRadius: "2px",
    background: "var(--md-sys-color-outline-variant)",
  },
});

const BackRow = styled("button", {
  base: {
    display: "flex",
    alignItems: "center",
    gap: "var(--gap-md)",
    width: "100%",
    minHeight: "48px",
    padding: "var(--gap-md) var(--gap-lg)",
    border: "none",
    background: "transparent",
    color: "inherit",
    fill: "currentColor",
    font: "inherit",
    fontWeight: 600,
    textAlign: "start",
    cursor: "pointer",
    borderBottom: "1px solid var(--md-sys-color-outline-variant)",
  },
});
