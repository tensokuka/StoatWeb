import { styled } from "styled-system/jsx";

export const ProfileCard = styled("div", {
  base: {
    // for <Ripple />:
    position: "relative",

    minWidth: 0,
    height: "100%",
    width: "100%",
    userSelect: "none",

    color: "var(--md-sys-color-on-surface)",
    background: "var(--md-sys-color-surface-container-low)",

    padding: "var(--gap-lg)",
    borderRadius: "var(--borderRadius-lg)",

    display: "flex",
    gap: "var(--gap-sm)",
    flexDirection: "column",
  },
  variants: {
    width: {
      1: {
        overflow: "hidden",
        aspectRatio: "1/1",

        // A third of a phone screen is too narrow to fit a square card's content
        _phone: {
          gridColumn: "1 / -1",
          aspectRatio: "auto",
        },
      },
      2: {
        gridColumn: "1 / 3",
      },
      3: {
        gridColumn: "1 / 4",
      },
    },
    constraint: {
      half: {
        overflow: "hidden",
        aspectRatio: "2/1",
      },
    },
    isLink: {
      true: {
        cursor: "pointer",
      },
    },
  },
  defaultVariants: {
    width: 1,
  },
});
