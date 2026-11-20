import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { mediaMatches } from "../test/setup";
import { CustomCursor } from "./CustomCursor";

describe("CustomCursor", () => {
  it("is off for touch and other coarse pointers", () => {
    render(<CustomCursor />);
    expect(screen.queryByTestId("cursor-layer")).not.toBeInTheDocument();
    expect(document.documentElement).not.toHaveClass("nx-cursor");
  });

  it("enables the arrow cursor and ring for a mouse", () => {
    mediaMatches["(pointer: fine)"] = true;
    render(<CustomCursor />);
    expect(screen.getByTestId("cursor-layer")).toHaveAttribute("data-reduced", "false");
    expect(document.documentElement).toHaveClass("nx-cursor");
  });

  it("drops the ring lag when reduced motion is requested", () => {
    mediaMatches["(pointer: fine)"] = true;
    mediaMatches["(prefers-reduced-motion)"] = true;
    mediaMatches["(prefers-reduced-motion: reduce)"] = true;
    render(<CustomCursor />);
    expect(screen.getByTestId("cursor-layer")).toHaveAttribute("data-reduced", "true");
  });
});
