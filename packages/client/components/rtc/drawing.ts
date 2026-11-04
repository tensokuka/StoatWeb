import { Accessor, createSignal, Setter } from "solid-js";

import { ReactiveMap } from "@solid-primitives/map";
import type { Room } from "livekit-client";
import { RoomEvent } from "livekit-client";

/**
 * Data channel and text stream topic for all drawing traffic
 */
export const DRAWING_TOPIC = "stoat.draw";

/**
 * Upper bound on points in one stroke, longer strokes are split by the sender
 */
export const MAX_POINTS_PER_STROKE = 5000;

/**
 * Upper bound on strokes kept per screen share, the oldest are dropped first
 */
export const MAX_STROKES_PER_TRACK = 1000;

/**
 * Upper bound on points in one reliable packet
 */
const MAX_POINTS_PER_BATCH = 200;

/**
 * How often buffered stroke points are sent
 */
const STROKE_FLUSH_MS = 50;

/**
 * Minimum time between cursor updates (~30 Hz)
 */
const CURSOR_THROTTLE_MS = 33;

/**
 * A stationary cursor is re-sent this often so that it doesn't expire
 */
const CURSOR_HEARTBEAT_MS = 1000;

/**
 * A remote cursor with no updates for this long is removed
 */
const CURSOR_EXPIRY_MS = 3000;

/**
 * Delay before asking the sharer for existing strokes again, doubles each time
 */
const SYNC_RETRY_MS = 1000;

/**
 * How many times to ask again before giving up
 */
const SYNC_MAX_RETRIES = 4;

/**
 * Line width in CSS pixels
 */
const STROKE_WIDTH = 3;

/**
 * Colours assigned to users, chosen to stand out against most screen content
 */
const STROKE_COLOURS = [
  "#ff5252",
  "#ff9100",
  "#ffd600",
  "#76ff03",
  "#00e676",
  "#1de9b6",
  "#00e5ff",
  "#40c4ff",
  "#536dfe",
  "#b388ff",
  "#e040fb",
  "#ff4081",
];

/**
 * Fields shared by stroke messages and synced strokes
 */
interface StrokeFields {
  id: string;
  color: string;
  w: number;
  /**
   * Flat list of normalised coordinates: x0, y0, x1, y1, ...
   */
  pts: number[];
  done: boolean;
}

/**
 * Stroke held in local state
 */
export interface Stroke extends StrokeFields {
  /**
   * Identity of the user who drew this stroke
   */
  owner: string;
}

/**
 * Batch of points belonging to a stroke
 */
export interface StrokeMessage extends StrokeFields {
  type: "stroke";
  track: string;
  /**
   * Index in the stroke of the first point in this batch
   */
  i: number;
}

/**
 * Message exchanged between participants
 */
export type DrawingMessage =
  | { type: "cursor"; track: string; x: number; y: number }
  | { type: "cursor_leave"; track: string }
  | StrokeMessage
  | { type: "clear"; track: string; scope: "mine" | "all" }
  | { type: "sync_request"; track: string }
  | { type: "sync"; track: string; strokes: StrokeFields[] };

/**
 * Remote cursor position
 */
export interface DrawingCursor {
  x: number;
  y: number;
  ts: number;
}

/**
 * Rectangle in CSS pixels
 */
export interface ContentRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Whether a value is a normalised coordinate
 */
function isUnit(value: unknown): value is number {
  return typeof value === "number" && value >= 0 && value <= 1;
}

/**
 * Whether a value is a track ID
 */
function isTrack(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 64;
}

/**
 * Whether a value holds valid stroke fields
 * @param value Unknown value
 * @param maxPoints Most points this value may contain
 */
function isStrokeFields(
  value: Partial<StrokeFields>,
  maxPoints: number,
): value is StrokeFields {
  return (
    typeof value.id === "string" &&
    value.id.length > 0 &&
    value.id.length <= 128 &&
    typeof value.color === "string" &&
    /^#[0-9a-f]{6}$/i.test(value.color) &&
    typeof value.w === "number" &&
    value.w >= 0.5 &&
    value.w <= 32 &&
    typeof value.done === "boolean" &&
    Array.isArray(value.pts) &&
    value.pts.length % 2 === 0 &&
    value.pts.length <= maxPoints * 2 &&
    value.pts.every(isUnit)
  );
}

/**
 * Encode a message for sending as text
 * @param message Message
 * @returns JSON
 */
export function encodeMessage(message: DrawingMessage): string {
  return JSON.stringify(message);
}

/**
 * Decode and validate a message. Peers aren't trusted, so anything
 * that doesn't exactly match the expected shape is discarded.
 * @param data Text or UTF-8 bytes
 * @returns Message, or undefined if it isn't valid
 */
export function decodeMessage(
  data: string | Uint8Array,
): DrawingMessage | undefined {
  let value;
  try {
    value = JSON.parse(
      typeof data === "string" ? data : new TextDecoder().decode(data),
    );
  } catch {
    return undefined;
  }

  if (typeof value !== "object" || value === null || !isTrack(value.track)) {
    return undefined;
  }

  switch (value.type) {
    case "cursor":
      return isUnit(value.x) && isUnit(value.y) ? value : undefined;
    case "cursor_leave":
    case "sync_request":
      return value;
    case "stroke":
      return Number.isInteger(value.i) &&
        value.i >= 0 &&
        isStrokeFields(value, MAX_POINTS_PER_BATCH)
        ? (value as StrokeMessage)
        : undefined;
    case "clear":
      return value.scope === "mine" || value.scope === "all"
        ? value
        : undefined;
    case "sync":
      return Array.isArray(value.strokes) &&
        value.strokes.length <= MAX_STROKES_PER_TRACK &&
        value.strokes.every((stroke: Partial<StrokeFields> | null) =>
          stroke ? isStrokeFields(stroke, MAX_POINTS_PER_STROKE) : false,
        )
        ? value
        : undefined;
    default:
      return undefined;
  }
}

/**
 * Get the identity of the user who drew a stroke from its ID
 * @param id Stroke ID in the form `identity:counter`
 * @returns Identity
 */
export function strokeOwner(id: string) {
  return id.slice(0, id.lastIndexOf(":"));
}

/**
 * Apply a batch of points to a list of strokes.
 * The offset in the batch lets it line up against a synced snapshot which may
 * already contain some or all of these points.
 * @param strokes Current strokes
 * @param batch Incoming batch
 * @returns New list of strokes, or the same list if nothing changed
 */
export function applyStrokeBatch(
  strokes: Stroke[],
  batch: Omit<StrokeMessage, "type" | "track">,
): Stroke[] {
  const index = strokes.findIndex((stroke) => stroke.id === batch.id);

  if (index === -1) {
    if (!batch.pts.length) return strokes;

    return [
      ...strokes,
      {
        id: batch.id,
        owner: strokeOwner(batch.id),
        color: batch.color,
        w: batch.w,
        pts: batch.pts.slice(0, MAX_POINTS_PER_STROKE * 2),
        done: batch.done,
      },
    ].slice(-MAX_STROKES_PER_TRACK);
  }

  const current = strokes[index];
  const start = Math.min(batch.i * 2, current.pts.length);
  const grows = start + batch.pts.length > current.pts.length;
  const done = current.done || batch.done;

  if (!grows && done === current.done) return strokes;

  const next = [...strokes];
  next[index] = {
    ...current,
    done,
    pts: grows
      ? current.pts
          .slice(0, start)
          .concat(batch.pts)
          .slice(0, MAX_POINTS_PER_STROKE * 2)
      : current.pts,
  };
  return next;
}

/**
 * Merge a snapshot from the sharer into a list of strokes.
 * Where a stroke is in both, whichever has more points wins.
 * @param strokes Current strokes
 * @param snapshot Strokes received from the sharer
 * @returns Merged strokes
 */
export function mergeSnapshot(
  strokes: Stroke[],
  snapshot: StrokeFields[],
): Stroke[] {
  const local = new Map(strokes.map((stroke) => [stroke.id, stroke]));
  const remote = new Set(snapshot.map((stroke) => stroke.id));

  return [
    ...snapshot.map((stroke) => {
      const existing = local.get(stroke.id);
      return existing && existing.pts.length > stroke.pts.length
        ? existing
        : { ...stroke, owner: strokeOwner(stroke.id) };
    }),
    ...strokes.filter((stroke) => !remote.has(stroke.id)),
  ].slice(-MAX_STROKES_PER_TRACK);
}

/**
 * Calculate where video is displayed within a box when using `object-fit: contain`
 * @param boxWidth Box width
 * @param boxHeight Box height
 * @param videoWidth Intrinsic video width, 0 if not known yet
 * @param videoHeight Intrinsic video height, 0 if not known yet
 * @returns Rectangle covered by the video, relative to the box
 */
export function contentRect(
  boxWidth: number,
  boxHeight: number,
  videoWidth: number,
  videoHeight: number,
): ContentRect {
  if (!videoWidth || !videoHeight || !boxWidth || !boxHeight) {
    return { x: 0, y: 0, width: boxWidth, height: boxHeight };
  }

  const scale = Math.min(boxWidth / videoWidth, boxHeight / videoHeight);
  const width = videoWidth * scale;
  const height = videoHeight * scale;

  return {
    x: (boxWidth - width) / 2,
    y: (boxHeight - height) / 2,
    width,
    height,
  };
}

/**
 * Convert a position within a box to coordinates normalised against the video
 * @param x Horizontal position relative to the box
 * @param y Vertical position relative to the box
 * @param rect Rectangle covered by the video
 * @returns Coordinates clamped to 0..1, or undefined if the rect is empty
 */
export function normalisePoint(x: number, y: number, rect: ContentRect) {
  if (!rect.width || !rect.height) return undefined;

  return {
    x: roundUnit((x - rect.x) / rect.width),
    y: roundUnit((y - rect.y) / rect.height),
  };
}

/**
 * Clamp a coordinate to 0..1 and shorten it for sending
 */
function roundUnit(value: number) {
  return Math.round(Math.min(1, Math.max(0, value)) * 10000) / 10000;
}

/**
 * Pick a colour for a user
 * @param userId User ID
 * @returns Hex colour
 */
export function colourForUser(userId: string) {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  }

  return STROKE_COLOURS[Math.abs(hash) % STROKE_COLOURS.length];
}

/**
 * Get initials to show next to a user's cursor
 * @param name Display name or username
 * @returns First letters of the first two words, otherwise the first two characters
 */
export function initialsFor(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);

  const initials =
    words.length > 1
      ? [...words[0]].slice(0, 1).concat([...words[1]].slice(0, 1))
      : [...(words[0] ?? "")].slice(0, 2);

  return initials.join("").toUpperCase();
}

/**
 * Convert a flat list of coordinates to an SVG points attribute.
 * A lone point is repeated, so that a click draws a dot.
 * @param pts Flat list of coordinates
 * @returns Value for the points attribute
 */
export function pointsAttribute(pts: number[]) {
  const pairs = [];
  for (let i = 0; i < pts.length; i += 2) {
    pairs.push(`${pts[i]},${pts[i + 1]}`);
  }

  return pairs.length === 1 ? `${pairs[0]} ${pairs[0]}` : pairs.join(" ");
}

/**
 * Stroke which the local user is currently drawing
 */
interface ActiveStroke {
  track: string;
  id: string;
  color: string;
  count: number;
  lastX: number;
  lastY: number;
  /**
   * Points yet to be sent
   */
  pending: number[];
}

/**
 * Options for the drawing controller
 */
interface DrawingOptions {
  /**
   * Whether the local user has disabled drawing on their screen share
   */
  isDisabledOnOwnShare: () => boolean;

  /**
   * Whether a user is allowed to clear other users' strokes in this channel
   * @param identity User's identity
   */
  canModerate: (identity: string) => boolean;
}

/**
 * Shares strokes and cursors on screen shares between participants of a room.
 * Only exists while connected, and has one instance per room.
 */
export class DrawingController {
  /**
   * Strokes by screen share track SID
   */
  readonly strokes = new ReactiveMap<string, Stroke[]>();

  /**
   * Remote cursors by screen share track SID, then by identity
   */
  readonly cursors = new ReactiveMap<
    string,
    ReactiveMap<string, DrawingCursor>
  >();

  /**
   * Track which the local user is in draw mode on
   */
  readonly drawMode: Accessor<string | undefined>;
  #setDrawMode: Setter<string | undefined>;

  /**
   * Whether the local user has permission to send drawing data
   */
  readonly canPublish: Accessor<boolean>;
  #setCanPublish: Setter<boolean>;

  /**
   * Colour picked by the local user for new strokes
   */
  #pickedColour: Accessor<string | undefined>;
  #setPickedColour: Setter<string | undefined>;

  #room: Room;
  #options: DrawingOptions;
  #disposed = false;

  /**
   * Starts from the current time so that IDs don't collide with
   * strokes from before the user left and rejoined the call.
   */
  #strokeCounter = Date.now();
  #active?: ActiveStroke;
  #flushTimer?: ReturnType<typeof setTimeout>;

  #cursor?: { track: string; x: number; y: number };
  #cursorSentAt = 0;
  #cursorTimer?: ReturnType<typeof setTimeout>;
  #maintenanceTimer: ReturnType<typeof setInterval>;

  #syncRequested = new Set<string>();
  #syncTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /**
   * Construct the controller and start listening to the room
   * @param room Room
   * @param options Options
   */
  constructor(room: Room, options: DrawingOptions) {
    this.#room = room;
    this.#options = options;

    const [drawMode, setDrawMode] = createSignal<string>();
    this.drawMode = drawMode;
    this.#setDrawMode = setDrawMode;

    const [canPublish, setCanPublish] = createSignal(false);
    this.canPublish = canPublish;
    this.#setCanPublish = setCanPublish;

    const [pickedColour, setPickedColour] = createSignal<string>();
    this.#pickedColour = pickedColour;
    this.#setPickedColour = setPickedColour;

    room.on(RoomEvent.Connected, this.#updatePermissions);
    room.on(RoomEvent.ParticipantPermissionsChanged, this.#updatePermissions);
    room.on(RoomEvent.DataReceived, this.#onData);
    room.on(RoomEvent.ParticipantDisconnected, this.#onParticipantDisconnected);
    room.on(RoomEvent.TrackUnpublished, this.#onTrackUnpublished);
    room.on(RoomEvent.LocalTrackUnpublished, this.#onTrackUnpublished);
    room.registerTextStreamHandler(DRAWING_TOPIC, this.#onTextStream);

    this.#maintenanceTimer = setInterval(
      this.#maintenance,
      CURSOR_HEARTBEAT_MS / 2,
    );

    this.#updatePermissions();
  }

  /**
   * Stop listening to the room, telling others that our cursor has gone
   */
  dispose() {
    this.setDrawMode(undefined);
    this.#disposed = true;

    clearInterval(this.#maintenanceTimer);
    for (const track of this.#syncTimers.keys()) this.#stopSyncRetries(track);

    const room = this.#room;
    room.off(RoomEvent.Connected, this.#updatePermissions);
    room.off(RoomEvent.ParticipantPermissionsChanged, this.#updatePermissions);
    room.off(RoomEvent.DataReceived, this.#onData);
    room.off(
      RoomEvent.ParticipantDisconnected,
      this.#onParticipantDisconnected,
    );
    room.off(RoomEvent.TrackUnpublished, this.#onTrackUnpublished);
    room.off(RoomEvent.LocalTrackUnpublished, this.#onTrackUnpublished);
    room.unregisterTextStreamHandler(DRAWING_TOPIC);
  }

  /**
   * Get the colour of new strokes, which is the user's own colour until they pick another
   * @returns Hex colour
   */
  colour() {
    return (
      this.#pickedColour() ??
      colourForUser(this.#room.localParticipant.identity)
    );
  }

  /**
   * Pick the colour of new strokes, existing strokes keep their colour
   * @param colour Hex colour
   */
  setColour(colour: string) {
    this.#setPickedColour(colour);
  }

  /**
   * Whether the local user is sharing this track
   * @param track Track SID
   */
  isSharer(track: string) {
    return this.#trackOwner(track) === this.#room.localParticipant.identity;
  }

  /**
   * Whether the local user may turn on draw mode for a track
   * @param track Track SID
   */
  canDrawOn(track: string) {
    return this.canPublish() && !this.#ignoring(track);
  }

  /**
   * Whether clearing a track removes everyone's strokes, not just our own
   * @param track Track SID
   */
  clearsAll(track: string) {
    return (
      this.isSharer(track) ||
      this.#options.canModerate(this.#room.localParticipant.identity)
    );
  }

  /**
   * Whether clearing a track would remove anything
   * @param track Track SID
   */
  canClear(track: string) {
    const strokes = this.strokes.get(track) ?? [];
    if (!this.canPublish()) return false;
    if (this.clearsAll(track)) return strokes.length > 0;

    const identity = this.#room.localParticipant.identity;
    return strokes.some((stroke) => stroke.owner === identity);
  }

  /**
   * Set which track the local user is in draw mode on
   * @param track Track SID, or undefined to leave draw mode
   */
  setDrawMode(track: string | undefined) {
    const previous = this.drawMode();
    if (previous === track) return;

    if (previous) {
      this.endStroke();
      this.leaveCursor(previous);
    }

    this.#setDrawMode(track && this.canDrawOn(track) ? track : undefined);
  }

  /**
   * Toggle draw mode on a track
   * @param track Track SID
   */
  toggleDrawMode(track: string) {
    this.setDrawMode(this.drawMode() === track ? undefined : track);
  }

  /**
   * Fetch existing strokes from the sharer when starting to watch a track.
   * Tiles are remounted when focus changes, so only do this once per track.
   *
   * The server can deliver our first packets before telling the sharer that we
   * joined. LiveKit can't attribute those packets to anyone, so they get dropped,
   * which means we have to keep asking until the sharer replies.
   * @param track Track SID
   */
  requestSync(track: string) {
    if (!this.canPublish() || this.#syncRequested.has(track)) return;

    const owner = this.#trackOwner(track);
    if (!owner || this.isSharer(track)) return;

    this.#syncRequested.add(track);
    this.#sendSyncRequest(track, owner, 0);
  }

  /**
   * Update the local user's cursor position
   * @param track Track SID
   * @param x Normalised horizontal position
   * @param y Normalised vertical position
   */
  moveCursor(track: string, x: number, y: number) {
    if (this.drawMode() !== track) return;

    this.#cursor = { track, x, y };
    if (this.#cursorTimer) return;

    const wait = this.#cursorSentAt + CURSOR_THROTTLE_MS - Date.now();
    if (wait > 0) {
      this.#cursorTimer = setTimeout(this.#sendCursor, wait);
    } else {
      this.#sendCursor();
    }
  }

  /**
   * Tell others that the local user's cursor has left a track
   * @param track Track SID
   */
  leaveCursor(track: string) {
    if (this.#cursor?.track !== track) return;

    clearTimeout(this.#cursorTimer);
    this.#cursorTimer = undefined;
    this.#cursor = undefined;

    this.#send({ type: "cursor_leave", track }, true);
  }

  /**
   * Start a new stroke
   * @param track Track SID
   * @param x Normalised horizontal position
   * @param y Normalised vertical position
   */
  beginStroke(track: string, x: number, y: number) {
    this.endStroke();
    if (this.drawMode() !== track) return;

    const identity = this.#room.localParticipant.identity;

    this.#active = {
      track,
      id: `${identity}:${this.#strokeCounter++}`,
      color: this.colour(),
      count: 0,
      lastX: x,
      lastY: y,
      pending: [],
    };

    this.#addPoint(x, y);
  }

  /**
   * Add a point to the stroke in progress
   * @param x Normalised horizontal position
   * @param y Normalised vertical position
   */
  extendStroke(x: number, y: number) {
    const active = this.#active;
    if (!active || (active.lastX === x && active.lastY === y)) return;

    if (active.count >= MAX_POINTS_PER_STROKE) {
      // continue seamlessly as a new stroke
      const { track, lastX, lastY } = active;
      this.beginStroke(track, lastX, lastY);
    }

    this.#addPoint(x, y);
  }

  /**
   * Finish the stroke in progress
   */
  endStroke() {
    if (!this.#active) return;

    this.#flush(true);
    this.#active = undefined;
  }

  /**
   * Clear strokes from a track, see {@link clearsAll} for the scope
   * @param track Track SID
   */
  clear(track: string) {
    this.endStroke();

    const scope = this.clearsAll(track) ? "all" : "mine";
    this.#removeStrokes(
      track,
      scope === "all" ? undefined : this.#room.localParticipant.identity,
    );
    this.#send({ type: "clear", track, scope }, true);
  }

  /**
   * Get the identity of whoever is sharing a track
   * @param track Track SID
   * @returns Identity, or undefined if this isn't a published screen share
   */
  #trackOwner(track: string) {
    const { localParticipant, remoteParticipants } = this.#room;
    if (localParticipant.trackPublications.has(track)) {
      return localParticipant.identity;
    }

    for (const participant of remoteParticipants.values()) {
      if (participant.trackPublications.has(track)) {
        return participant.identity;
      }
    }

    return undefined;
  }

  /**
   * Whether this is our own screen share, and we've disabled drawing on it
   * @param track Track SID
   */
  #ignoring(track: string) {
    return this.#options.isDisabledOnOwnShare() && this.isSharer(track);
  }

  /**
   * Ask the sharer for existing strokes, and schedule asking again
   * @param track Track SID
   * @param owner Identity of the sharer
   * @param attempt How many times we've already asked
   */
  #sendSyncRequest(track: string, owner: string, attempt: number) {
    this.#syncTimers.delete(track);
    this.#send({ type: "sync_request", track }, true, [owner]);

    if (attempt < SYNC_MAX_RETRIES) {
      this.#syncTimers.set(
        track,
        setTimeout(
          () => this.#sendSyncRequest(track, owner, attempt + 1),
          SYNC_RETRY_MS * 2 ** attempt,
        ),
      );
    }
  }

  /**
   * Stop asking the sharer for existing strokes
   * @param track Track SID
   */
  #stopSyncRetries(track: string) {
    clearTimeout(this.#syncTimers.get(track));
    this.#syncTimers.delete(track);
  }

  /**
   * Publish a message
   * @param message Message
   * @param reliable Whether to use the reliable channel
   * @param destinationIdentities Recipients, otherwise everyone in the room
   */
  #send(
    message: DrawingMessage,
    reliable: boolean,
    destinationIdentities?: string[],
  ) {
    if (this.#disposed || !this.canPublish()) return;

    this.#room.localParticipant
      .publishData(new TextEncoder().encode(encodeMessage(message)), {
        reliable,
        topic: DRAWING_TOPIC,
        destinationIdentities,
      })
      .catch((err) => console.debug("Failed to send drawing data", err));
  }

  /**
   * Record a point locally and queue it for sending
   */
  #addPoint(x: number, y: number) {
    const active = this.#active!;

    this.#updateStrokes(active.track, (strokes) =>
      applyStrokeBatch(strokes, {
        id: active.id,
        color: active.color,
        w: STROKE_WIDTH,
        i: active.count,
        pts: [x, y],
        done: false,
      }),
    );

    active.count++;
    active.lastX = x;
    active.lastY = y;
    active.pending.push(x, y);

    if (active.pending.length >= MAX_POINTS_PER_BATCH * 2) {
      this.#flush(false);
    } else if (!this.#flushTimer) {
      this.#flushTimer = setTimeout(() => this.#flush(false), STROKE_FLUSH_MS);
    }
  }

  /**
   * Send queued points of the stroke in progress
   * @param done Whether this completes the stroke
   */
  #flush(done: boolean) {
    clearTimeout(this.#flushTimer);
    this.#flushTimer = undefined;

    const active = this.#active;
    if (!active || (!done && !active.pending.length)) return;

    const batch = {
      id: active.id,
      color: active.color,
      w: STROKE_WIDTH,
      i: active.count - active.pending.length / 2,
      pts: active.pending,
      done,
    };

    active.pending = [];

    if (done) {
      this.#updateStrokes(active.track, (strokes) =>
        applyStrokeBatch(strokes, { ...batch, pts: [] }),
      );
    }

    this.#send({ type: "stroke", track: active.track, ...batch }, true);
  }

  /**
   * Replace the strokes on a track
   */
  #updateStrokes(track: string, update: (strokes: Stroke[]) => Stroke[]) {
    this.strokes.set(track, update(this.strokes.get(track) ?? []));
  }

  /**
   * Remove strokes from a track
   * @param track Track SID
   * @param owner Only remove strokes drawn by this user
   */
  #removeStrokes(track: string, owner?: string) {
    this.#updateStrokes(track, (strokes) =>
      owner ? strokes.filter((stroke) => stroke.owner !== owner) : [],
    );
  }

  /**
   * Send the most recent cursor position
   */
  #sendCursor = () => {
    this.#cursorTimer = undefined;
    if (!this.#cursor) return;

    this.#cursorSentAt = Date.now();
    this.#send({ type: "cursor", ...this.#cursor }, false);
  };

  /**
   * Keep our stationary cursor alive, and remove cursors that have gone quiet
   */
  #maintenance = () => {
    const now = Date.now();

    if (this.#cursor && now - this.#cursorSentAt >= CURSOR_HEARTBEAT_MS) {
      this.#sendCursor();
    }

    for (const cursors of this.cursors.values()) {
      for (const [identity, cursor] of cursors.entries()) {
        if (now - cursor.ts > CURSOR_EXPIRY_MS) {
          cursors.delete(identity);
        }
      }
    }
  };

  /**
   * Update whether we're allowed to send data
   */
  #updatePermissions = () => {
    const canPublish =
      !!this.#room.localParticipant.permissions?.canPublishData;

    this.#setCanPublish(canPublish);
    if (!canPublish) this.setDrawMode(undefined);
  };

  /**
   * Handle an incoming data packet
   */
  #onData = (
    payload: Uint8Array,
    participant?: { identity: string },
    _kind?: unknown,
    topic?: string,
  ) => {
    if (topic !== DRAWING_TOPIC || !participant) return;

    const message = decodeMessage(payload);
    // snapshots are large, so they only ever arrive as a text stream
    if (message && message.type !== "sync") {
      this.#handleMessage(message, participant.identity);
    }
  };

  /**
   * Handle an incoming text stream
   */
  #onTextStream = (
    reader: { readAll: () => Promise<string> },
    participant: { identity: string },
  ) => {
    reader
      .readAll()
      .then((text) => {
        if (this.#disposed) return;

        const message = decodeMessage(text);
        if (message?.type === "sync") {
          this.#handleMessage(message, participant.identity);
        }
      })
      .catch((err) => console.debug("Failed to read drawing sync", err));
  };

  /**
   * Apply a message from another participant
   * @param message Message
   * @param sender Identity of the sender, as authenticated by the server
   */
  #handleMessage(message: DrawingMessage, sender: string) {
    const { track } = message;

    // also drops anything arriving just after a share has ended,
    // which would otherwise bring back strokes that were just removed
    const owner = this.#trackOwner(track);
    if (!owner || this.#ignoring(track)) return;

    switch (message.type) {
      case "cursor": {
        let cursors = this.cursors.get(track);
        if (!cursors) {
          cursors = new ReactiveMap();
          this.cursors.set(track, cursors);
        }

        cursors.set(sender, {
          x: message.x,
          y: message.y,
          ts: Date.now(),
        });
        break;
      }
      case "cursor_leave":
        this.cursors.get(track)?.delete(sender);
        break;
      case "stroke":
        if (strokeOwner(message.id) === sender) {
          this.#updateStrokes(track, (strokes) =>
            applyStrokeBatch(strokes, message),
          );
        }
        break;
      case "clear":
        if (message.scope === "mine") {
          this.#removeStrokes(track, sender);
        } else if (sender === owner || this.#options.canModerate(sender)) {
          this.#removeStrokes(track);
        }
        break;
      case "sync_request":
        if (this.isSharer(track)) {
          this.#sendSnapshot(track, sender);
        }
        break;
      case "sync":
        if (sender === owner) {
          this.#stopSyncRetries(track);
          this.#updateStrokes(track, (strokes) =>
            mergeSnapshot(strokes, message.strokes),
          );
        }
        break;
    }
  }

  /**
   * Send all strokes on a track to someone who has just started watching.
   * This is sent even if there are none, as it tells them to stop asking.
   * @param track Track SID
   * @param identity Recipient
   */
  #sendSnapshot(track: string, identity: string) {
    if (!this.canPublish()) return;

    const strokes = this.strokes.get(track) ?? [];

    this.#room.localParticipant
      .sendText(
        encodeMessage({
          type: "sync",
          track,
          strokes: strokes.map(({ id, color, w, pts, done }) => ({
            id,
            color,
            w,
            pts,
            done,
          })),
        }),
        { topic: DRAWING_TOPIC, destinationIdentities: [identity] },
      )
      .catch((err) => console.debug("Failed to send drawing sync", err));
  }

  /**
   * Remove a participant's cursors when they leave
   */
  #onParticipantDisconnected = (participant: { identity: string }) => {
    for (const cursors of this.cursors.values()) {
      cursors.delete(participant.identity);
    }
  };

  /**
   * Drop all state for a share when it ends
   */
  #onTrackUnpublished = (publication: { trackSid: string }) => {
    const track = publication.trackSid;

    if (this.drawMode() === track) this.setDrawMode(undefined);
    if (this.#active?.track === track) this.endStroke();

    this.strokes.delete(track);
    this.cursors.delete(track);
    this.#syncRequested.delete(track);
    this.#stopSyncRetries(track);
  };
}
