/**
 * Makes the phone's Back button (or gesture) close whatever is on top: a
 * menu, dialog, picker or full-screen page, and on phones the open channel.
 *
 * While anything closable is open, one "guard" history entry sits above the
 * current page. Back pops it; we close the top item before the router sees
 * the event and, if more remain, put a new guard back. Closing something any
 * other way removes the guard again once nothing is left open.
 *
 * On phone layout, route changes replace the current entry instead of adding
 * one, so Back goes channel → channel list → leaves the app, like a native
 * app, instead of walking back through every channel visited.
 */

export interface BackEntry {
  close: () => void;
}

type HistoryState = Record<string, unknown> | null;

/** The parts of `window` this needs, so tests can supply a fake */
export interface BackWindow {
  history: Pick<History, "pushState" | "replaceState" | "back"> & {
    readonly state: unknown;
  };
  location: { readonly href: string };
  addEventListener(
    type: "popstate",
    listener: (event: PopStateEvent) => void,
    options?: AddEventListenerOptions | boolean,
  ): void;
  setTimeout(handler: () => void, timeout?: number): unknown;
}

const GUARD = "__back_guard";

function isGuard(state: unknown) {
  return !!state && typeof state === "object" && GUARD in state;
}

export class BackStack {
  #stack: BackEntry[] = [];
  #guardOnTop = false;
  /** Pops we caused with history.back() and must hide from the router */
  #expectedPops = 0;
  /** History writes made while one of our pops was still in flight */
  #queue: (() => void)[] = [];
  /** URL the app is showing, restored if a pop lands on a stale entry */
  #url: string;
  #push: History["pushState"];
  #replace: History["replaceState"];

  /**
   * @param win Window to manage
   * @param enabled Whether to manage Back at all right now
   * @param collapseRoutes Whether route changes should replace the entry
   */
  constructor(
    private win: BackWindow,
    private enabled: () => boolean,
    private collapseRoutes: () => boolean,
  ) {
    const history = win.history;
    this.#push = history.pushState.bind(history);
    this.#replace = history.replaceState.bind(history);
    this.#url = win.location.href;

    // Capture, registered before the router mounts, so we run first and
    // can stop the router from seeing pops that are ours
    win.addEventListener("popstate", (event) => this.#onPop(event), true);

    history.pushState = (state, unused, url) =>
      this.#write(() => this.#routePush(state as HistoryState, url));
    history.replaceState = (state, unused, url) =>
      this.#write(() => this.#routeReplace(state as HistoryState, url));
  }

  /** Number of open items, for tests and debugging */
  get size() {
    return this.#stack.length;
  }

  /**
   * Register something Back should close
   * @returns Call when it closes some other way
   */
  open(close: () => void): () => void {
    const entry: BackEntry = { close };
    if (!this.enabled()) return () => {};

    this.#stack.push(entry);
    this.#write(() => this.#ensureGuard());
    return () => this.#release(entry);
  }

  #release(entry: BackEntry) {
    const index = this.#stack.indexOf(entry);
    if (index === -1) return;
    this.#stack.splice(index, 1);

    // Wait a tick: closing one thing often opens another (a menu item
    // opening a dialog), which should keep the guard
    this.win.setTimeout(() => this.#write(() => this.#dropGuardIfIdle()), 0);
  }

  #guardState(): HistoryState {
    const current = this.win.history.state as HistoryState;
    return { _depth: current?._depth, [GUARD]: true };
  }

  #ensureGuard() {
    if (this.#guardOnTop || !this.#stack.length) return;
    this.#push(this.#guardState(), "", this.#url);
    this.#guardOnTop = true;
  }

  #dropGuardIfIdle() {
    if (this.#stack.length || !this.#guardOnTop) return;
    this.#guardOnTop = false;
    if (isGuard(this.win.history.state)) {
      this.#expectedPops++;
      this.win.history.back();
    }
  }

  /** Run now, or after our in-flight pop has landed */
  #write(fn: () => void) {
    if (this.#expectedPops > 0) this.#queue.push(fn);
    else fn();
  }

  #routePush(state: HistoryState, url?: string | URL | null) {
    if (url != null) this.#url = new URL(url, this.#url).href;

    if (this.#guardOnTop) {
      // The new page takes the guard's place, and gets a guard of its own
      // while things are still open. Phones keep a single entry below it.
      if (this.collapseRoutes()) {
        this.#replace({ ...state, [GUARD]: true }, "", this.#url);
      } else {
        this.#replace(state, "", this.#url);
        this.#guardOnTop = false;
        this.#ensureGuard();
      }
    } else if (this.collapseRoutes()) {
      this.#replace(state, "", this.#url);
    } else {
      this.#push(state, "", this.#url);
    }
  }

  #routeReplace(state: HistoryState, url?: string | URL | null) {
    if (url != null) this.#url = new URL(url, this.#url).href;
    const keep = isGuard(this.win.history.state) ? { [GUARD]: true } : {};
    this.#replace({ ...state, ...keep }, "", this.#url);
  }

  /** Put the URL back if a pop landed on an entry made for an older page */
  #restoreUrl() {
    if (this.win.location.href !== this.#url) {
      const state = this.win.history.state as HistoryState;
      this.#replace(state, "", this.#url);
    }
  }

  #flush() {
    const queue = this.#queue;
    this.#queue = [];
    for (const fn of queue) this.#write(fn);
  }

  #onPop(event: PopStateEvent) {
    if (this.#expectedPops > 0) {
      this.#expectedPops--;
      event.stopImmediatePropagation();
      this.#restoreUrl();
      if (!this.#expectedPops) this.#flush();
      return;
    }

    if (this.#guardOnTop) {
      // Back pressed: close the top item instead of navigating
      event.stopImmediatePropagation();
      this.#guardOnTop = false;
      this.#restoreUrl();

      const entry = this.#stack.pop();
      entry?.close();
      this.#ensureGuard();
      return;
    }

    if (isGuard(this.win.history.state)) {
      // Forward onto a guard nothing needs any more
      event.stopImmediatePropagation();
      this.#expectedPops++;
      this.win.history.back();
      return;
    }

    // An ordinary route change, which the router handles
    this.#url = this.win.location.href;
  }
}
