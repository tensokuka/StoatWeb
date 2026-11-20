import { styled } from "styled-system/jsx";

/**
 * A message's text, selectable with the usual handles. iOS needs text
 * selection off on messages for long press to open the menu, so this is the
 * way to copy part of one.
 */
export function SelectableText(props: { text: string }) {
  return (
    <Text
      // taps here select text, they shouldn't close the menu
      onClick={(e) => e.stopImmediatePropagation()}
    >
      {props.text}
    </Text>
  );
}

const Text = styled("div", {
  base: {
    padding: "var(--gap-lg)",
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    lineHeight: 1.5,
    fontSize: "16px",
    userSelect: "text",
    WebkitUserSelect: "text",
    WebkitTouchCallout: "default",
    cursor: "text",
  },
});
