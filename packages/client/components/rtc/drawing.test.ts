import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyStrokeBatch,
  colourForUser,
  contentRect,
  decodeMessage,
  DRAWING_TOPIC,
  DrawingController,
  DrawingMessage,
  encodeMessage,
  initialsFor,
  MAX_POINTS_PER_STROKE,
  MAX_STROKES_PER_TRACK,
  mergeSnapshot,
  normalisePoint,
  pointsAttribute,
  Stroke,
  strokeOwner,
} from "./drawing";

const COLOR = "#ff5252";

const fields = (id: string, pts: number[], done = false) => ({
  id,
  color: COLOR,
  w: 3,
  pts,
  done,
});

const stroke = (id: string, pts: number[], done = false): Stroke => ({
  ...fields(id, pts, done),
  owner: strokeOwner(id),
});

describe("message encoding", () => {
  it("round trips every message type", () => {
    const messages: DrawingMessage[] = [
      { type: "cursor", track: "TR_a", x: 0.5, y: 1 },
      { type: "cursor_leave", track: "TR_a" },
      { type: "stroke", track: "TR_a", i: 2, ...fields("u:1", [0, 1], true) },
      { type: "clear", track: "TR_a", scope: "all" },
      { type: "sync_request", track: "TR_a" },
      { type: "sync", track: "TR_a", strokes: [fields("u:1", [0.1, 0.2])] },
    ];

    for (const message of messages) {
      expect(decodeMessage(encodeMessage(message))).toEqual(message);
      expect(
        decodeMessage(new TextEncoder().encode(encodeMessage(message))),
      ).toEqual(message);
    }
  });

  it.each([
    ["invalid JSON", "{"],
    ["a primitive", "1"],
    ["null", "null"],
    ["an unknown type", { type: "nope", track: "t" }],
    ["a missing track", { type: "cursor", x: 0, y: 0 }],
    ["a cursor out of range", { type: "cursor", track: "t", x: 2, y: 0 }],
    ["a NaN-like cursor", { type: "cursor", track: "t", x: "0", y: 0 }],
    ["an unknown scope", { type: "clear", track: "t", scope: "everything" }],
    [
      "an odd number of coordinates",
      { type: "stroke", track: "t", i: 0, ...fields("u:1", [0]) },
    ],
    [
      "a coordinate out of range",
      { type: "stroke", track: "t", i: 0, ...fields("u:1", [0, 5]) },
    ],
    [
      "a negative offset",
      { type: "stroke", track: "t", i: -1, ...fields("u:1", [0, 0]) },
    ],
    [
      "a colour which isn't hex",
      {
        type: "stroke",
        track: "t",
        i: 0,
        ...fields("u:1", [0, 0]),
        color: "url(#x)",
      },
    ],
    [
      "an oversized batch",
      {
        type: "stroke",
        track: "t",
        i: 0,
        ...fields("u:1", new Array(100000).fill(0)),
      },
    ],
    ["a null synced stroke", { type: "sync", track: "t", strokes: [null] }],
  ])("rejects %s", (_, input) => {
    expect(
      decodeMessage(typeof input === "string" ? input : JSON.stringify(input)),
    ).toBeUndefined();
  });
});

describe("applyStrokeBatch", () => {
  it("creates a stroke, deriving the owner from its ID", () => {
    const [created] = applyStrokeBatch([], {
      ...fields("alice:7", [0.1, 0.2]),
      i: 0,
    });

    expect(created.owner).toBe("alice");
    expect(created.pts).toEqual([0.1, 0.2]);
  });

  it("appends to an existing stroke without mutating it", () => {
    const before = [stroke("a:1", [0, 0])];
    const after = applyStrokeBatch(before, { ...fields("a:1", [1, 1]), i: 1 });

    expect(after[0].pts).toEqual([0, 0, 1, 1]);
    expect(before[0].pts).toEqual([0, 0]);
  });

  it("doesn't duplicate points which a snapshot already has", () => {
    const before = [stroke("a:1", [0, 0, 0.1, 0.1, 0.2, 0.2])];

    expect(
      applyStrokeBatch(before, { ...fields("a:1", [0.1, 0.1]), i: 1 }),
    ).toBe(before);
  });

  it("replaces only the overlap when a batch extends past a snapshot", () => {
    const after = applyStrokeBatch([stroke("a:1", [0, 0, 0.1, 0.1])], {
      ...fields("a:1", [0.1, 0.1, 0.2, 0.2]),
      i: 1,
    });

    expect(after[0].pts).toEqual([0, 0, 0.1, 0.1, 0.2, 0.2]);
  });

  it("carries on from the end when points were missed", () => {
    const after = applyStrokeBatch([stroke("a:1", [0, 0])], {
      ...fields("a:1", [1, 1]),
      i: 50,
    });

    expect(after[0].pts).toEqual([0, 0, 1, 1]);
  });

  it("marks a stroke as done with no new points", () => {
    const after = applyStrokeBatch([stroke("a:1", [0, 0])], {
      ...fields("a:1", [], true),
      i: 1,
    });

    expect(after[0].done).toBe(true);
    expect(after[0].pts).toEqual([0, 0]);
  });

  it("ignores an empty batch for an unknown stroke", () => {
    const before: Stroke[] = [];
    expect(applyStrokeBatch(before, { ...fields("a:1", [], true), i: 0 })).toBe(
      before,
    );
  });

  it("caps points per stroke", () => {
    const full = new Array(MAX_POINTS_PER_STROKE * 2).fill(0);
    const after = applyStrokeBatch([stroke("a:1", full)], {
      ...fields("a:1", [1, 1]),
      i: MAX_POINTS_PER_STROKE,
    });

    expect(after[0].pts.length).toBe(MAX_POINTS_PER_STROKE * 2);
  });

  it("drops the oldest stroke when over the limit", () => {
    const before = Array.from({ length: MAX_STROKES_PER_TRACK }, (_, n) =>
      stroke(`a:${n}`, [0, 0]),
    );
    const after = applyStrokeBatch(before, {
      ...fields("a:new", [0, 0]),
      i: 0,
    });

    expect(after.length).toBe(MAX_STROKES_PER_TRACK);
    expect(after[0].id).toBe("a:1");
    expect(after[after.length - 1].id).toBe("a:new");
  });
});

describe("mergeSnapshot", () => {
  it("adds missing strokes and keeps ones the snapshot lacks", () => {
    const merged = mergeSnapshot(
      [stroke("b:1", [0, 0])],
      [fields("a:1", [1, 1])],
    );

    expect(merged.map((s) => s.id)).toEqual(["a:1", "b:1"]);
    expect(merged[0].owner).toBe("a");
  });

  it("keeps whichever copy has more points", () => {
    const merged = mergeSnapshot(
      [stroke("a:1", [0, 0, 1, 1]), stroke("a:2", [0, 0])],
      [fields("a:1", [0, 0]), fields("a:2", [0, 0, 1, 1])],
    );

    expect(merged[0].pts.length).toBe(4);
    expect(merged[1].pts.length).toBe(4);
  });
});

describe("contentRect", () => {
  it("letterboxes wide video in a tall box", () => {
    expect(contentRect(100, 100, 200, 100)).toEqual({
      x: 0,
      y: 25,
      width: 100,
      height: 50,
    });
  });

  it("pillarboxes tall video in a wide box", () => {
    expect(contentRect(200, 100, 100, 100)).toEqual({
      x: 50,
      y: 0,
      width: 100,
      height: 100,
    });
  });

  it("fills the box until the video size is known", () => {
    expect(contentRect(200, 100, 0, 0)).toEqual({
      x: 0,
      y: 0,
      width: 200,
      height: 100,
    });
  });
});

describe("normalisePoint", () => {
  const rect = { x: 0, y: 25, width: 100, height: 50 };

  it("is relative to the video, not the box", () => {
    expect(normalisePoint(50, 50, rect)).toEqual({ x: 0.5, y: 0.5 });
    expect(normalisePoint(0, 25, rect)).toEqual({ x: 0, y: 0 });
  });

  it("clamps points over the black bars", () => {
    expect(normalisePoint(50, 0, rect)).toEqual({ x: 0.5, y: 0 });
    expect(normalisePoint(500, 100, rect)).toEqual({ x: 1, y: 1 });
  });

  it("gives nothing for an empty rect", () => {
    expect(normalisePoint(0, 0, { x: 0, y: 0, width: 0, height: 0 })).toBe(
      undefined,
    );
  });
});

describe("helpers", () => {
  it.each([
    ["Ada Lovelace", "AL"],
    ["  ada   b  c ", "AB"],
    ["ada", "AD"],
    ["x", "X"],
    ["", ""],
    ["😀😁 x", "😀X"],
  ])("initials of %j are %j", (name, initials) => {
    expect(initialsFor(name)).toBe(initials);
  });

  it("gives a stable hex colour per user", () => {
    expect(colourForUser("01ABC")).toBe(colourForUser("01ABC"));
    expect(colourForUser("01ABC")).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("repeats a lone point so that it renders as a dot", () => {
    expect(pointsAttribute([0.5, 0.5])).toBe("0.5,0.5 0.5,0.5");
    expect(pointsAttribute([0, 0, 1, 1])).toBe("0,0 1,1");
  });
});

/**
 * Minimal room with one remote user sharing "TR_remote",
 * and the local user "me" sharing "TR_local"
 */
function fakeRoom(canPublishData = true) {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  let textHandler:
    | ((
        reader: { readAll: () => Promise<string> },
        participant: { identity: string },
      ) => void)
    | undefined;

  const room = {
    localParticipant: {
      identity: "me",
      permissions: { canPublishData },
      trackPublications: new Map([["TR_local", {}]]),
      publishData: vi.fn((_: Uint8Array, _opts: unknown) => Promise.resolve()),
      sendText: vi.fn((_: string, _opts: unknown) => Promise.resolve()),
    },
    remoteParticipants: new Map([
      [
        "sharer",
        {
          identity: "sharer",
          trackPublications: new Map([["TR_remote", {}]]),
        },
      ],
    ]),
    on(event: string, listener: (...args: unknown[]) => void) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(listener);
    },
    off(event: string, listener: (...args: unknown[]) => void) {
      listeners.get(event)?.delete(listener);
    },
    registerTextStreamHandler: vi.fn(
      (_: string, handler: typeof textHandler) => {
        textHandler = handler;
      },
    ),
    unregisterTextStreamHandler: vi.fn(),
  };

  const emit = (event: string, ...args: unknown[]) =>
    listeners.get(event)?.forEach((listener) => listener(...args));

  return {
    room,
    emit,
    listenerCount: () =>
      [...listeners.values()].reduce((sum, set) => sum + set.size, 0),
    /**
     * Deliver a data packet from a remote user
     */
    receive(message: DrawingMessage, identity: string, topic = DRAWING_TOPIC) {
      emit(
        "dataReceived",
        new TextEncoder().encode(encodeMessage(message)),
        { identity },
        undefined,
        topic,
      );
    },
    /**
     * Deliver a text stream from a remote user
     */
    async receiveStream(message: DrawingMessage, identity: string) {
      textHandler!(
        { readAll: () => Promise.resolve(encodeMessage(message)) },
        { identity },
      );
      await Promise.resolve();
      await Promise.resolve();
    },
    /**
     * Decode everything which has been published
     */
    sent() {
      return room.localParticipant.publishData.mock.calls.map(
        ([data, opts]) => ({
          message: decodeMessage(data)!,
          opts: opts as { reliable: boolean; destinationIdentities?: string[] },
        }),
      );
    },
  };
}

function setup(
  options: {
    canPublishData?: boolean;
    disabled?: boolean;
    moderators?: string[];
  } = {},
) {
  const fake = fakeRoom(options.canPublishData ?? true);
  const controller = new DrawingController(
    fake.room as unknown as ConstructorParameters<typeof DrawingController>[0],
    {
      isDisabledOnOwnShare: () => options.disabled ?? false,
      canModerate: (id) => (options.moderators ?? []).includes(id),
    },
  );

  return { ...fake, controller };
}

const remoteStroke = (id: string, pts: number[]): DrawingMessage => ({
  type: "stroke",
  track: "TR_remote",
  i: 0,
  ...fields(id, pts),
});

describe("DrawingController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows strokes as they're drawn and sends them in batches", () => {
    const { controller, sent } = setup();
    controller.setDrawMode("TR_remote");

    controller.beginStroke("TR_remote", 0.1, 0.1);
    controller.extendStroke(0.2, 0.2);
    controller.extendStroke(0.3, 0.3);

    expect(controller.strokes.get("TR_remote")![0].pts.length).toBe(6);
    expect(sent()).toEqual([]);

    vi.advanceTimersByTime(50);
    expect(sent().map((s) => s.message)).toMatchObject([
      {
        type: "stroke",
        i: 0,
        pts: [0.1, 0.1, 0.2, 0.2, 0.3, 0.3],
        done: false,
      },
    ]);

    controller.extendStroke(0.4, 0.4);
    controller.endStroke();

    const final = sent()[1];
    expect(final.opts.reliable).toBe(true);
    expect(final.message).toMatchObject({ i: 3, pts: [0.4, 0.4], done: true });
    expect(controller.strokes.get("TR_remote")![0].done).toBe(true);

    controller.dispose();
  });

  it("uses an ID which won't collide after leaving and rejoining", () => {
    const first = setup();
    first.controller.setDrawMode("TR_remote");
    first.controller.beginStroke("TR_remote", 0, 0);
    first.controller.endStroke();

    vi.advanceTimersByTime(5);

    const second = setup();
    second.controller.setDrawMode("TR_remote");
    second.controller.beginStroke("TR_remote", 0, 0);
    second.controller.endStroke();

    const id = (fake: typeof first) =>
      fake.controller.strokes.get("TR_remote")![0].id;

    expect(id(first)).toMatch(/^me:\d+$/);
    expect(id(first)).not.toBe(id(second));

    first.controller.dispose();
    second.controller.dispose();
  });

  it("defaults to the user's colour and uses a picked colour for new strokes", () => {
    const { controller, sent } = setup();
    controller.setDrawMode("TR_remote");
    expect(controller.colour()).toBe(colourForUser("me"));

    controller.beginStroke("TR_remote", 0, 0);
    controller.endStroke();

    controller.setColour("#123abc");
    controller.beginStroke("TR_remote", 1, 1);
    controller.endStroke();

    const strokes = controller.strokes.get("TR_remote")!;
    expect(strokes[0].color).toBe(colourForUser("me"));
    expect(strokes[1].color).toBe("#123abc");
    expect(sent().at(-1)!.message).toMatchObject({ color: "#123abc" });

    controller.dispose();
  });

  it("splits a stroke which reaches the point limit", () => {
    const { controller } = setup();
    controller.setDrawMode("TR_remote");
    controller.beginStroke("TR_remote", 0, 0);

    for (let n = 1; n <= MAX_POINTS_PER_STROKE; n++) {
      controller.extendStroke(n / 10000, 0.5);
    }

    const strokes = controller.strokes.get("TR_remote")!;
    expect(strokes.length).toBe(2);
    expect(strokes[0].pts.length).toBe(MAX_POINTS_PER_STROKE * 2);
    // the second stroke joins up with the end of the first
    expect(strokes[1].pts.slice(0, 2)).toEqual(strokes[0].pts.slice(-2));

    controller.dispose();
  });

  it("does nothing outside of draw mode", () => {
    const { controller, sent } = setup();

    controller.beginStroke("TR_remote", 0, 0);
    controller.moveCursor("TR_remote", 0, 0);
    vi.advanceTimersByTime(100);

    expect(controller.strokes.get("TR_remote")).toBeUndefined();
    expect(sent()).toEqual([]);

    controller.dispose();
  });

  it("throttles cursor updates but always sends the latest", () => {
    const { controller, sent } = setup();
    controller.setDrawMode("TR_remote");

    controller.moveCursor("TR_remote", 0.1, 0.1);
    controller.moveCursor("TR_remote", 0.2, 0.2);
    controller.moveCursor("TR_remote", 0.3, 0.3);
    expect(sent().length).toBe(1);
    expect(sent()[0].opts.reliable).toBe(false);

    vi.advanceTimersByTime(33);
    expect(sent().map((s) => s.message)).toMatchObject([
      { x: 0.1 },
      { x: 0.3 },
    ]);

    controller.dispose();
  });

  it("keeps a stationary cursor alive until draw mode ends", () => {
    const { controller, sent } = setup();
    controller.setDrawMode("TR_remote");
    controller.moveCursor("TR_remote", 0.5, 0.5);

    vi.advanceTimersByTime(5000);
    expect(sent().length).toBeGreaterThanOrEqual(4);

    controller.setDrawMode(undefined);
    const count = sent().length;
    expect(sent()[count - 1].message.type).toBe("cursor_leave");
    expect(sent()[count - 1].opts.reliable).toBe(true);

    vi.advanceTimersByTime(5000);
    expect(sent().length).toBe(count);

    controller.dispose();
  });

  it("only keeps one draw mode at a time", () => {
    const { controller, sent } = setup();

    controller.setDrawMode("TR_remote");
    controller.moveCursor("TR_remote", 0, 0);
    controller.toggleDrawMode("TR_local");

    expect(controller.drawMode()).toBe("TR_local");
    expect(sent().at(-1)!.message).toEqual({
      type: "cursor_leave",
      track: "TR_remote",
    });

    controller.dispose();
  });

  it("applies strokes from other users", () => {
    const { controller, receive } = setup();

    receive(remoteStroke("alice:1", [0.5, 0.5]), "alice");

    expect(controller.strokes.get("TR_remote")![0]).toMatchObject({
      owner: "alice",
      pts: [0.5, 0.5],
    });

    controller.dispose();
  });

  it("rejects strokes impersonating another user", () => {
    const { controller, receive } = setup();

    receive(remoteStroke("alice:1", [0.5, 0.5]), "mallory");

    expect(controller.strokes.get("TR_remote")).toBeUndefined();

    controller.dispose();
  });

  it("ignores other topics and tracks which aren't published", () => {
    const { controller, receive } = setup();

    receive(remoteStroke("alice:1", [0, 0]), "alice", "other");
    receive(
      {
        ...remoteStroke("alice:1", [0, 0]),
        track: "TR_gone",
      } as DrawingMessage,
      "alice",
    );

    expect(controller.strokes.size).toBe(0);

    controller.dispose();
  });

  it("tracks remote cursors and expires quiet ones", () => {
    const { controller, receive } = setup();
    const message: DrawingMessage = {
      type: "cursor",
      track: "TR_remote",
      x: 0.2,
      y: 0.3,
    };

    receive(message, "alice");
    receive(message, "bob");
    expect(controller.cursors.get("TR_remote")!.get("alice")).toMatchObject({
      x: 0.2,
      y: 0.3,
    });

    receive({ type: "cursor_leave", track: "TR_remote" }, "alice");
    expect(controller.cursors.get("TR_remote")!.has("alice")).toBe(false);
    expect(controller.cursors.get("TR_remote")!.has("bob")).toBe(true);

    vi.advanceTimersByTime(4000);
    expect(controller.cursors.get("TR_remote")!.has("bob")).toBe(false);

    controller.dispose();
  });

  it("keeps strokes but removes cursors when a user leaves", () => {
    const { controller, receive, emit } = setup();

    receive(remoteStroke("alice:1", [0, 0]), "alice");
    receive({ type: "cursor", track: "TR_remote", x: 0, y: 0 }, "alice");

    emit("participantDisconnected", { identity: "alice" });

    expect(controller.cursors.get("TR_remote")!.has("alice")).toBe(false);
    expect(controller.strokes.get("TR_remote")!.length).toBe(1);

    controller.dispose();
  });

  describe("clearing", () => {
    it("only clears our own strokes unless we're the sharer", () => {
      const { controller, receive, sent } = setup();
      receive(remoteStroke("alice:1", [0, 0]), "alice");

      expect(controller.canClear("TR_remote")).toBe(false);

      controller.setDrawMode("TR_remote");
      controller.beginStroke("TR_remote", 0.5, 0.5);
      controller.endStroke();

      expect(controller.clearsAll("TR_remote")).toBe(false);
      expect(controller.canClear("TR_remote")).toBe(true);

      controller.clear("TR_remote");

      expect(sent().at(-1)!.message).toEqual({
        type: "clear",
        track: "TR_remote",
        scope: "mine",
      });
      expect(controller.strokes.get("TR_remote")!.map((s) => s.owner)).toEqual([
        "alice",
      ]);

      controller.dispose();
    });

    it("clears everything on our own share", () => {
      const { controller, receive, sent } = setup();
      receive(
        {
          ...remoteStroke("alice:1", [0, 0]),
          track: "TR_local",
        } as DrawingMessage,
        "alice",
      );

      expect(controller.clearsAll("TR_local")).toBe(true);
      controller.clear("TR_local");

      expect(sent().at(-1)!.message).toMatchObject({ scope: "all" });
      expect(controller.strokes.get("TR_local")).toEqual([]);

      controller.dispose();
    });

    it("lets moderators clear everything", () => {
      const { controller } = setup({ moderators: ["me"] });
      expect(controller.clearsAll("TR_remote")).toBe(true);
      controller.dispose();
    });

    it("applies clears according to the sender", () => {
      const { controller, receive } = setup({ moderators: ["mod"] });
      const clearAll: DrawingMessage = {
        type: "clear",
        track: "TR_remote",
        scope: "all",
      };
      const count = () => controller.strokes.get("TR_remote")!.length;

      receive(remoteStroke("alice:1", [0, 0]), "alice");
      receive(remoteStroke("bob:1", [0, 0]), "bob");

      receive(clearAll, "mallory");
      expect(count()).toBe(2);

      receive({ ...clearAll, scope: "mine" } as DrawingMessage, "alice");
      expect(controller.strokes.get("TR_remote")!.map((s) => s.owner)).toEqual([
        "bob",
      ]);

      receive(clearAll, "sharer");
      expect(count()).toBe(0);

      receive(remoteStroke("bob:2", [0, 0]), "bob");
      receive(clearAll, "mod");
      expect(count()).toBe(0);

      controller.dispose();
    });
  });

  describe("sync", () => {
    it("asks the sharer once, however many times the tile remounts", () => {
      const { controller, sent } = setup();

      controller.requestSync("TR_remote");
      controller.requestSync("TR_remote");

      expect(sent()).toMatchObject([
        {
          message: { type: "sync_request", track: "TR_remote" },
          opts: { reliable: true, destinationIdentities: ["sharer"] },
        },
      ]);

      controller.dispose();
    });

    it("doesn't ask when we're the sharer", () => {
      const { controller, sent } = setup();
      controller.requestSync("TR_local");
      expect(sent()).toEqual([]);
      controller.dispose();
    });

    it("sends only the requester a snapshot of our own share", () => {
      const { controller, receive, room } = setup();
      receive(
        {
          ...remoteStroke("alice:1", [0, 0]),
          track: "TR_local",
        } as DrawingMessage,
        "alice",
      );

      receive({ type: "sync_request", track: "TR_local" }, "carol");

      const [text, opts] = room.localParticipant.sendText.mock.calls[0];
      expect(opts).toEqual({
        topic: DRAWING_TOPIC,
        destinationIdentities: ["carol"],
      });
      expect(decodeMessage(text)).toMatchObject({
        type: "sync",
        track: "TR_local",
        strokes: [{ id: "alice:1" }],
      });

      controller.dispose();
    });

    it("doesn't answer for someone else's share", () => {
      const { controller, receive, room } = setup();

      receive(remoteStroke("alice:1", [0, 0]), "alice");
      receive({ type: "sync_request", track: "TR_remote" }, "carol");

      expect(room.localParticipant.sendText).not.toHaveBeenCalled();

      controller.dispose();
    });

    it("answers with an empty snapshot so that the requester stops asking", () => {
      const { controller, receive, room } = setup();

      receive({ type: "sync_request", track: "TR_local" }, "carol");

      expect(
        decodeMessage(room.localParticipant.sendText.mock.calls[0][0]),
      ).toEqual({ type: "sync", track: "TR_local", strokes: [] });

      controller.dispose();
    });

    const requests = (fake: ReturnType<typeof setup>) =>
      fake.sent().filter((s) => s.message.type === "sync_request").length;

    it("keeps asking when the sharer doesn't reply, then gives up", () => {
      // the sharer can't attribute packets sent before it knows that we joined
      const fake = setup();
      fake.controller.requestSync("TR_remote");
      expect(requests(fake)).toBe(1);

      vi.advanceTimersByTime(1000);
      expect(requests(fake)).toBe(2);

      vi.advanceTimersByTime(2000);
      expect(requests(fake)).toBe(3);

      vi.advanceTimersByTime(60000);
      expect(requests(fake)).toBe(5);

      fake.controller.dispose();
    });

    it("stops asking once the sharer replies", async () => {
      const fake = setup();
      fake.controller.requestSync("TR_remote");

      await fake.receiveStream(
        { type: "sync", track: "TR_remote", strokes: [] },
        "sharer",
      );

      vi.advanceTimersByTime(60000);
      expect(requests(fake)).toBe(1);

      fake.controller.dispose();
    });

    it("keeps asking when someone else sends a snapshot", async () => {
      const fake = setup();
      fake.controller.requestSync("TR_remote");

      await fake.receiveStream(
        { type: "sync", track: "TR_remote", strokes: [] },
        "mallory",
      );

      vi.advanceTimersByTime(1000);
      expect(requests(fake)).toBe(2);

      fake.controller.dispose();
    });

    it("stops asking when the share ends or we leave", () => {
      const ended = setup();
      ended.controller.requestSync("TR_remote");
      ended.emit("trackUnpublished", { trackSid: "TR_remote" });
      vi.advanceTimersByTime(60000);
      expect(requests(ended)).toBe(1);
      ended.controller.dispose();

      const left = setup();
      left.controller.requestSync("TR_remote");
      left.controller.dispose();
      vi.advanceTimersByTime(60000);
      expect(requests(left)).toBe(1);
    });

    it("accepts a snapshot from the sharer only, over text streams only", async () => {
      const { controller, receive, receiveStream } = setup();
      const snapshot: DrawingMessage = {
        type: "sync",
        track: "TR_remote",
        strokes: [fields("alice:1", [0, 0])],
      };

      await receiveStream(snapshot, "mallory");
      receive(snapshot, "sharer");
      expect(controller.strokes.get("TR_remote")).toBeUndefined();

      await receiveStream(snapshot, "sharer");
      expect(controller.strokes.get("TR_remote")!.length).toBe(1);

      controller.dispose();
    });
  });

  describe("when a share ends", () => {
    it.each([
      ["remote", "trackUnpublished", "TR_remote"],
      ["local", "localTrackUnpublished", "TR_local"],
    ])("drops all state for a %s share", (_, event, track) => {
      const { controller, emit, receive } = setup();
      controller.setDrawMode(track);
      controller.beginStroke(track, 0, 0);
      receive({ type: "cursor", track, x: 0, y: 0 }, "alice");

      emit(event, { trackSid: track });

      expect(controller.drawMode()).toBeUndefined();
      expect(controller.strokes.has(track)).toBe(false);
      expect(controller.cursors.has(track)).toBe(false);

      controller.dispose();
    });
  });

  describe("when disabled on our own share", () => {
    it("ignores strokes and sync requests for our share only", () => {
      const { controller, receive, room } = setup({ disabled: true });

      receive(
        {
          ...remoteStroke("alice:1", [0, 0]),
          track: "TR_local",
        } as DrawingMessage,
        "alice",
      );
      receive({ type: "cursor", track: "TR_local", x: 0, y: 0 }, "alice");
      receive({ type: "sync_request", track: "TR_local" }, "carol");
      receive(remoteStroke("alice:1", [0, 0]), "alice");

      expect(controller.strokes.has("TR_local")).toBe(false);
      expect(controller.cursors.has("TR_local")).toBe(false);
      expect(room.localParticipant.sendText).not.toHaveBeenCalled();
      expect(controller.strokes.get("TR_remote")!.length).toBe(1);

      expect(controller.canDrawOn("TR_local")).toBe(false);
      expect(controller.canDrawOn("TR_remote")).toBe(true);

      controller.setDrawMode("TR_local");
      expect(controller.drawMode()).toBeUndefined();

      controller.dispose();
    });
  });

  describe("without permission to publish data", () => {
    it("can't draw or send anything, and doesn't error", () => {
      const { controller, sent } = setup({ canPublishData: false });

      expect(controller.canPublish()).toBe(false);
      expect(controller.canDrawOn("TR_remote")).toBe(false);

      controller.setDrawMode("TR_remote");
      controller.requestSync("TR_remote");

      expect(controller.drawMode()).toBeUndefined();
      expect(sent()).toEqual([]);

      controller.dispose();
    });

    it("leaves draw mode if permission is revoked", () => {
      const { controller, emit, room } = setup();
      controller.setDrawMode("TR_remote");

      room.localParticipant.permissions.canPublishData = false;
      emit("participantPermissionsChanged");

      expect(controller.drawMode()).toBeUndefined();

      controller.dispose();
    });

    it("picks up permission once connected", () => {
      const { controller, emit, room } = setup({ canPublishData: false });

      room.localParticipant.permissions.canPublishData = true;
      emit("connected");

      expect(controller.canPublish()).toBe(true);

      controller.dispose();
    });
  });

  it("removes everything from the room on dispose", () => {
    const { controller, room, sent, listenerCount } = setup();
    controller.setDrawMode("TR_remote");
    controller.moveCursor("TR_remote", 0, 0);

    controller.dispose();

    expect(sent().at(-1)!.message.type).toBe("cursor_leave");
    expect(listenerCount()).toBe(0);
    expect(room.unregisterTextStreamHandler).toHaveBeenCalledWith(
      DRAWING_TOPIC,
    );

    const count = sent().length;
    vi.advanceTimersByTime(5000);
    expect(sent().length).toBe(count);
  });
});
