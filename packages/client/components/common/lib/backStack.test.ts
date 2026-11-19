import { describe, expect, it } from "vitest";

import { BackStack, BackWindow } from "./backStack";

/**
 * A history like the browser's: a list of entries, with back() landing
 * asynchronously and firing popstate at the listeners in order
 */
class FakeWindow implements BackWindow {
  entries: { state: unknown; url: string }[] = [
    { state: null, url: "https://app/" },
  ];
  index = 0;
  listeners: ((event: PopStateEvent) => void)[] = [];
  timers: (() => void)[] = [];
  /** URLs the "router" saw through popstate */
  routerSaw: string[] = [];

  history = {
    pushState: (state: unknown, _: string, url?: string | URL | null) => {
      this.entries.splice(this.index + 1);
      this.entries.push({ state, url: this.resolve(url) });
      this.index++;
    },
    replaceState: (state: unknown, _: string, url?: string | URL | null) => {
      this.entries[this.index] = { state, url: this.resolve(url) };
    },
    back: () => {
      this.timers.push(() => this.go(-1));
    },
    get state() {
      return null as unknown;
    },
  };

  location = {
    href: "",
  };

  constructor() {
    const win = this; // eslint-disable-line @typescript-eslint/no-this-alias
    Object.defineProperty(this.history, "state", {
      get: () => win.entries[win.index].state,
    });
    Object.defineProperty(this.location, "href", {
      get: () => win.entries[win.index].url,
    });
  }

  resolve(url?: string | URL | null) {
    return url == null
      ? this.entries[this.index].url
      : new URL(url, "https://app/").href;
  }

  addEventListener(_: "popstate", listener: (event: PopStateEvent) => void) {
    this.listeners.push(listener);
  }

  setTimeout(handler: () => void) {
    this.timers.push(handler);
  }

  /** The user presses Back */
  pressBack() {
    this.go(-1);
    this.settle();
  }

  go(delta: number) {
    if (this.index + delta < 0) {
      this.routerSaw.push("left the app");
      return;
    }
    this.index += delta;
    let stopped = false;
    const event = {
      stopImmediatePropagation: () => (stopped = true),
    } as unknown as PopStateEvent;
    for (const listener of this.listeners) {
      listener(event);
      if (stopped) return;
    }
  }

  /** Run timers and pending traversals until nothing is left */
  settle() {
    while (this.timers.length) this.timers.shift()!();
  }

  get urls() {
    return this.entries.slice(0, this.index + 1).map((e) => e.url);
  }
}

function setup(collapse = false) {
  const win = new FakeWindow();
  const stack = new BackStack(
    win,
    () => true,
    () => collapse,
  );
  // The router listens after us
  win.addEventListener("popstate", () => win.routerSaw.push(win.location.href));
  /** A route change made by the router */
  const navigate = (path: string) => {
    win.history.pushState({ route: path }, "", path);
    win.settle();
  };
  return { win, stack, navigate };
}

describe("BackStack", () => {
  it("closes the top item on Back without the router noticing", () => {
    const { win, stack } = setup();
    const closed: string[] = [];

    stack.open(() => closed.push("dialog"));
    stack.open(() => closed.push("menu"));
    expect(win.urls).toEqual(["https://app/", "https://app/"]);

    win.pressBack();
    expect(closed).toEqual(["menu"]);
    expect(stack.size).toBe(1);
    // A new guard went up for the dialog
    expect(win.urls).toHaveLength(2);

    win.pressBack();
    expect(closed).toEqual(["menu", "dialog"]);
    expect(win.urls).toEqual(["https://app/"]);
    expect(win.routerSaw).toEqual([]);
  });

  it("removes the guard when the last item closes some other way", () => {
    const { win, stack } = setup();
    const release = stack.open(() => {});
    release();
    win.settle();

    expect(win.urls).toEqual(["https://app/"]);
    expect(win.routerSaw).toEqual([]);
  });

  it("keeps the guard when closing one item opens another", () => {
    const { win, stack } = setup();
    const closed: string[] = [];
    const releaseMenu = stack.open(() => closed.push("menu"));

    releaseMenu();
    stack.open(() => closed.push("dialog"));
    win.settle();
    expect(win.urls).toHaveLength(2);

    win.pressBack();
    expect(closed).toEqual(["dialog"]);
  });

  it("lets ordinary route changes through to the router", () => {
    const { win, navigate } = setup();
    navigate("/channel/1");
    navigate("/channel/2");

    win.pressBack();
    expect(win.routerSaw).toEqual(["https://app/channel/1"]);
  });

  it("keeps one guard on top when a route changes under an open item", () => {
    const { win, stack, navigate } = setup();
    const closed: string[] = [];
    stack.open(() => closed.push("search"));

    navigate("/channel/1");
    expect(win.urls).toEqual([
      "https://app/",
      "https://app/channel/1",
      "https://app/channel/1",
    ]);

    win.pressBack();
    expect(closed).toEqual(["search"]);
    expect(win.location.href).toBe("https://app/channel/1");

    win.pressBack();
    expect(win.routerSaw).toEqual(["https://app/"]);
  });

  describe("on phones", () => {
    it("goes channel, then channel list, then out of the app", () => {
      const { win, stack, navigate } = setup(true);
      const shown: string[] = [];

      // Tapping a channel shows it, then the router navigates
      stack.open(() => shown.push("channel list"));
      navigate("/channel/1");
      navigate("/channel/2");
      expect(win.urls).toEqual(["https://app/", "https://app/channel/2"]);

      win.pressBack();
      expect(shown).toEqual(["channel list"]);
      // Still on the channel that was open, not the first entry's URL
      expect(win.location.href).toBe("https://app/channel/2");
      expect(win.urls).toHaveLength(1);

      win.pressBack();
      expect(win.routerSaw).toEqual(["left the app"]);
    });

    it("fixes the URL after closing over a channel opened while hidden", () => {
      const { win, stack, navigate } = setup(true);
      navigate("/channel/1");
      const release = stack.open(() => {});
      navigate("/channel/2");

      release();
      win.settle();
      expect(win.urls).toEqual(["https://app/channel/2"]);
      expect(win.routerSaw).toEqual([]);
    });
  });

  it("queues router writes made while its own Back is in flight", () => {
    const { win, stack } = setup();
    const release = stack.open(() => {});
    release();
    // The guard's back() is queued; the router navigates before it lands
    win.timers.shift()!();
    win.history.pushState({ route: "/x" }, "", "/x");
    win.settle();

    expect(win.urls).toEqual(["https://app/", "https://app/x"]);
    expect(win.routerSaw).toEqual([]);
  });
});
