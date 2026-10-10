import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import * as React from "react";

import { useHistory } from "./use-history";

/**
 * Undo over a value the caller owns.
 *
 * Every other control in the product is a form field you can retype. A design
 * is not: dragging a layer somewhere wrong loses a position that took a
 * minute to get right, and without undo the only way back is remembering the
 * numbers.
 */
function setup(initial = "a") {
  return renderHook(() => {
    const [value, setValue] = React.useState(initial);
    const history = useHistory(value, setValue);
    return { value, history };
  });
}

describe("undo", () => {
  it("has nothing to undo before anything is edited", () => {
    const { result } = setup();

    expect(result.current.history.canUndo).toBe(false);
    expect(result.current.history.canRedo).toBe(false);
  });

  it("goes back to the value before a commit", () => {
    const { result } = setup("a");

    act(() => result.current.history.commit("b"));
    expect(result.current.value).toBe("b");

    act(() => result.current.history.undo());
    expect(result.current.value).toBe("a");
  });

  it("steps back through several edits in order", () => {
    const { result } = setup("a");

    act(() => result.current.history.commit("b"));
    act(() => result.current.history.commit("c"));

    act(() => result.current.history.undo());
    expect(result.current.value).toBe("b");
    act(() => result.current.history.undo());
    expect(result.current.value).toBe("a");
  });

  it("does nothing when there is nothing to undo", () => {
    const { result } = setup("a");

    act(() => result.current.history.undo());

    expect(result.current.value).toBe("a");
  });
});

describe("redo", () => {
  it("returns to the undone value", () => {
    const { result } = setup("a");

    act(() => result.current.history.commit("b"));
    act(() => result.current.history.undo());
    act(() => result.current.history.redo());

    expect(result.current.value).toBe("b");
  });

  it("is discarded once a new edit is made", () => {
    // Redoing onto a branch the user has left would restore a value that was
    // never on the path they took.
    const { result } = setup("a");

    act(() => result.current.history.commit("b"));
    act(() => result.current.history.undo());
    act(() => result.current.history.commit("c"));

    expect(result.current.history.canRedo).toBe(false);
  });
});

describe("coalescing", () => {
  it("collapses a drag into one undo step", () => {
    /*
     * A drag fires a change per pointer move. Without this, undo steps back
     * one pixel at a time through a hundred entries and feels broken.
     */
    const { result } = setup("start");

    act(() => result.current.history.commit("x1", { coalesce: "drag:a" }));
    act(() => result.current.history.commit("x2", { coalesce: "drag:a" }));
    act(() => result.current.history.commit("x3", { coalesce: "drag:a" }));

    act(() => result.current.history.undo());

    expect(result.current.value).toBe("start");
  });

  it("starts a new step for a different layer", () => {
    const { result } = setup("start");

    act(() => result.current.history.commit("a1", { coalesce: "drag:a" }));
    act(() => result.current.history.commit("b1", { coalesce: "drag:b" }));

    act(() => result.current.history.undo());

    expect(result.current.value).toBe("a1");
  });

  it("starts a new step after an uncoalesced edit", () => {
    const { result } = setup("start");

    act(() => result.current.history.commit("a1", { coalesce: "drag:a" }));
    act(() => result.current.history.commit("typed"));
    act(() => result.current.history.commit("a2", { coalesce: "drag:a" }));

    act(() => result.current.history.undo());
    expect(result.current.value).toBe("typed");
  });

  it("does not merge a drag into the step it just undid", () => {
    const { result } = setup("start");

    act(() => result.current.history.commit("moved", { coalesce: "drag:a" }));
    act(() => result.current.history.undo());
    act(() => result.current.history.commit("moved again", { coalesce: "drag:a" }));
    act(() => result.current.history.undo());

    expect(result.current.value).toBe("start");
  });
});

describe("reset", () => {
  it("forgets the history without touching the value", () => {
    const { result } = setup("a");

    act(() => result.current.history.commit("b"));
    act(() => result.current.history.reset());

    expect(result.current.value).toBe("b");
    expect(result.current.history.canUndo).toBe(false);
  });
});
