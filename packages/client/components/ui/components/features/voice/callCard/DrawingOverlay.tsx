import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Index,
  onCleanup,
  onMount,
  Show,
} from "solid-js";

import { useLingui } from "@lingui/solid/macro";
import { styled } from "styled-system/jsx";

import { useUser } from "@revolt/markdown/users";
import {
  colourForUser,
  contentRect,
  DrawingController,
  DrawingCursor,
  initialsFor,
  normalisePoint,
  pointsAttribute,
} from "@revolt/rtc/drawing";
import { IconButton } from "@revolt/ui/components/design";
import { Symbol } from "@revolt/ui/components/utils/Symbol";

/**
 * Strokes and cursors on top of a screen share, which also takes
 * pointer input while the local user is in draw mode on this track.
 */
export function DrawingOverlay(props: {
  controller: DrawingController;
  track: string;
  videoWidth: number;
  videoHeight: number;
}) {
  let box!: HTMLDivElement;

  const [size, setSize] = createSignal({ width: 0, height: 0 });
  const active = () => props.controller.drawMode() === props.track;

  const rect = createMemo(() =>
    contentRect(
      size().width,
      size().height,
      props.videoWidth,
      props.videoHeight,
    ),
  );

  const cursorIds = () => {
    const cursors = props.controller.cursors.get(props.track);
    return cursors ? [...cursors.keys()] : [];
  };

  /**
   * Convert the position of a pointer event to normalised coordinates
   */
  function toPoint(event: PointerEvent) {
    const bounds = box.getBoundingClientRect();
    return normalisePoint(
      event.clientX - bounds.left,
      event.clientY - bounds.top,
      rect(),
    );
  }

  /**
   * Start drawing, capturing the pointer so the stroke
   * can carry on if it strays outside of the tile
   */
  function onPointerDown(event: PointerEvent) {
    if (!active() || event.button !== 0) return;

    const point = toPoint(event);
    if (!point) return;

    box.setPointerCapture(event.pointerId);
    props.controller.beginStroke(props.track, point.x, point.y);
  }

  /**
   * Update the cursor, and the stroke if there is one in progress
   */
  function onPointerMove(event: PointerEvent) {
    if (!active()) return;

    const point = toPoint(event);
    if (!point) return;

    props.controller.moveCursor(props.track, point.x, point.y);
    props.controller.extendStroke(point.x, point.y);
  }

  onMount(() => {
    const observer = new ResizeObserver(() =>
      setSize({ width: box.clientWidth, height: box.clientHeight }),
    );

    observer.observe(box);
    onCleanup(() => observer.disconnect());
  });

  createEffect(() => props.controller.requestSync(props.track));

  // draw mode outlives this component as focusing a tile remounts it
  onCleanup(() => {
    props.controller.endStroke();
    props.controller.leaveCursor(props.track);
  });

  return (
    <Box
      ref={box}
      active={active()}
      aria-hidden="true"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => props.controller.endStroke()}
      onPointerCancel={() => props.controller.endStroke()}
      onPointerLeave={() => props.controller.leaveCursor(props.track)}
      onClick={(event) => {
        // don't toggle focus on the tile below
        if (active()) event.stopPropagation();
      }}
    >
      <Content
        style={{
          left: `${rect().x}px`,
          top: `${rect().y}px`,
          width: `${rect().width}px`,
          height: `${rect().height}px`,
        }}
      >
        <Canvas viewBox="0 0 1 1" preserveAspectRatio="none">
          <Index each={props.controller.strokes.get(props.track)}>
            {(stroke) => (
              <polyline
                points={pointsAttribute(stroke().pts)}
                stroke={stroke().color}
                stroke-width={stroke().w}
                stroke-linecap="round"
                stroke-linejoin="round"
                fill="none"
                vector-effect="non-scaling-stroke"
              />
            )}
          </Index>
        </Canvas>
        <For each={cursorIds()}>
          {(identity) => (
            <RemoteCursor
              identity={identity}
              cursor={props.controller.cursors.get(props.track)?.get(identity)}
            />
          )}
        </For>
      </Content>
    </Box>
  );
}

/**
 * Another user's pen, labelled with their initials
 */
function RemoteCursor(props: { identity: string; cursor?: DrawingCursor }) {
  const user = useUser(() => props.identity);

  return (
    <Show when={props.cursor}>
      <Pen
        style={{
          left: `${(props.cursor?.x ?? 0) * 100}%`,
          top: `${(props.cursor?.y ?? 0) * 100}%`,
          color: colourForUser(props.identity),
        }}
      >
        <Symbol size={20}>edit</Symbol>
        <Initials style={{ "background-color": colourForUser(props.identity) }}>
          {initialsFor(user().username)}
        </Initials>
      </Pen>
    </Show>
  );
}

/**
 * Buttons for toggling draw mode and clearing strokes on a screen share
 */
export function DrawingControls(props: {
  controller: DrawingController;
  track: string;
}) {
  const { t } = useLingui();

  const active = () => props.controller.drawMode() === props.track;
  const drawLabel = () =>
    active() ? t`Stop drawing` : t`Draw on screen share`;
  const clearLabel = () =>
    props.controller.clearsAll(props.track)
      ? t`Clear all drawings`
      : t`Clear my drawings`;

  return (
    <Controls active={active()} onClick={(event) => event.stopPropagation()}>
      <Show when={active()}>
        <ColourInput
          type="color"
          aria-label={t`Drawing colour`}
          value={props.controller.colour()}
          onInput={(event) =>
            props.controller.setColour(event.currentTarget.value)
          }
          use:floating={{
            tooltip: { placement: "bottom", content: t`Drawing colour` },
          }}
        />
      </Show>
      <Show when={props.controller.canClear(props.track)}>
        <IconButton
          size="xs"
          variant="tonal"
          aria-label={clearLabel()}
          onPress={() => props.controller.clear(props.track)}
          use:floating={{
            tooltip: { placement: "bottom", content: clearLabel() },
          }}
        >
          <Symbol>ink_eraser</Symbol>
        </IconButton>
      </Show>
      <Show when={props.controller.canDrawOn(props.track)}>
        <IconButton
          size="xs"
          variant={active() ? "filled" : "tonal"}
          aria-label={drawLabel()}
          aria-pressed={active()}
          onPress={() => props.controller.toggleDrawMode(props.track)}
          use:floating={{
            tooltip: { placement: "bottom", content: drawLabel() },
          }}
        >
          <Symbol fill={active()}>draw</Symbol>
        </IconButton>
      </Show>
    </Controls>
  );
}

const Box = styled("div", {
  base: {
    gridArea: "1/1",
    position: "relative",
    minWidth: 0,
    minHeight: 0,
    overflow: "hidden",
    pointerEvents: "none",
  },
  variants: {
    active: {
      true: {
        pointerEvents: "auto",
        cursor: "crosshair",
        touchAction: "none",
      },
    },
  },
});

const Content = styled("div", {
  base: {
    position: "absolute",
    pointerEvents: "none",
  },
});

const Canvas = styled("svg", {
  base: {
    display: "block",
    width: "100%",
    height: "100%",
  },
});

const Pen = styled("div", {
  base: {
    position: "absolute",
    display: "flex",
    alignItems: "center",
    gap: "2px",
    // puts the tip of the icon on the point being drawn
    transform: "translateY(-100%)",
    transition: "left 50ms linear, top 50ms linear",
    filter: "drop-shadow(0 1px 1px #0008)",
  },
});

const Initials = styled("span", {
  base: {
    padding: "0 4px",
    borderRadius: "var(--borderRadius-sm)",
    color: "#000",
    fontSize: "10px",
    fontWeight: 600,
    lineHeight: "16px",
    whiteSpace: "nowrap",
  },
});

const ColourInput = styled("input", {
  base: {
    width: "32px",
    height: "32px",
    padding: 0,
    border: "none",
    borderRadius: "var(--borderRadius-full)",
    background: "transparent",
    cursor: "pointer",

    "&::-webkit-color-swatch-wrapper": {
      padding: "4px",
    },
    "&::-webkit-color-swatch": {
      border: "2px solid white",
      borderRadius: "var(--borderRadius-full)",
    },
    "&::-moz-color-swatch": {
      border: "2px solid white",
      borderRadius: "var(--borderRadius-full)",
    },
  },
});

const Controls = styled("div", {
  base: {
    gridArea: "1/1",
    // keeps the controls above the drawing surface, which is also positioned
    position: "relative",
    justifySelf: "end",
    alignSelf: "start",
    display: "flex",
    gap: "var(--gap-sm)",
    margin: "var(--gap-md)",

    opacity: 0,
    transition: "var(--transitions-fast) opacity",

    _groupHover: {
      opacity: 1,
    },
    _focusWithin: {
      opacity: 1,
    },
  },
  variants: {
    active: {
      true: {
        opacity: 1,
      },
    },
  },
});
