import { Accessor, createEffect, onCleanup } from "solid-js";

import Breakpoint from "../Breakpoint";

import { BackStack } from "./backStack";

/**
 * Back only matters where people have a Back button or gesture to press:
 * phones and tablets. Desktop keeps the browser's own behaviour.
 */
const touch = () =>
  typeof window !== "undefined" && matchMedia("(pointer: coarse)").matches;

const phone = () => matchMedia(Breakpoint.phone).matches;

/** Created on import, before the router starts listening */
export const backStack =
  typeof window !== "undefined" ? new BackStack(window, touch, phone) : null;

/**
 * Close something with Back while `open` is true
 * @param open Whether it's showing
 * @param close Close it
 */
export function useBackHandler(open: Accessor<boolean>, close: () => void) {
  createEffect(() => {
    if (!open() || !backStack) return;
    const release = backStack.open(close);
    onCleanup(release);
  });
}
