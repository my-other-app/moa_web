import * as React from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@moa/api";
import { SESSION_RENEWAL, SessionEndHost, signInAgainPath, useUnsavedWork } from "@moa/app-kit";

import { render } from "@/test/render";

/**
 * A session the client could not renew (packages/app-kit/src/auth): sign in
 * again where you were, and first a word when the page holds unsaved work.
 */

const ended = () => act(() => SESSION_RENEWAL.onEnded?.(new ApiError({ message: "Token has been revoked", status: 401 })));

function Editor({ dirty }: { dirty: boolean }) {
  useUnsavedWork(dirty);
  return <p>editor</p>;
}

const at = (path: string) => window.history.replaceState(null, "", path);
afterEach(() => {
  at("/");
  vi.unstubAllGlobals();
});

describe("a session that could not be renewed", () => {
  it("goes to sign-in at once when nothing is unsaved, coming back to the same place", async () => {
    at("/events/7/emails?tab=ticket");
    const go = vi.fn();
    render(<SessionEndHost go={go} />);
    ended();
    expect(go).toHaveBeenCalledWith(`/login?next=${encodeURIComponent("/events/7/emails?tab=ticket")}`);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("asks first when the page holds unsaved work, and keeps it while signing in elsewhere", async () => {
    at("/website");
    const go = vi.fn();
    const open = vi.fn();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 1 }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <>
        <Editor dirty />
        <SessionEndHost go={go} open={open} />
      </>,
    );
    ended();
    expect(await screen.findByRole("alertdialog")).toHaveTextContent(/changes that aren.t saved yet/);
    expect(go).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Sign in in a new tab" }));
    expect(open).toHaveBeenCalledWith("/login");
    fireEvent.click(screen.getByRole("button", { name: /I.ve signed in/ }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    // Checked without renewing: the other tab's sign-in is what made it work.
    expect(fetchMock).toHaveBeenCalledWith("/api/gateway/api/v1/auth/me", expect.anything());
    expect(go).not.toHaveBeenCalled();
  });

  it("says so when the tab is still signed out, and can sign in here instead", async () => {
    at("/emails/3");
    const go = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401, headers: { "content-type": "application/json" } })));
    render(
      <>
        <Editor dirty />
        <SessionEndHost go={go} open={vi.fn()} />
      </>,
    );
    ended();
    fireEvent.click(await screen.findByRole("button", { name: "Sign in in a new tab" }));
    fireEvent.click(screen.getByRole("button", { name: /I.ve signed in/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/still signed out/);
    fireEvent.click(screen.getByRole("button", { name: /Sign in here/ }));
    expect(go).toHaveBeenCalledWith(`/login?next=${encodeURIComponent("/emails/3")}`);
  });

  it("does nothing on the pages that need no session (a door link, sign-in)", () => {
    const go = vi.fn();
    render(<SessionEndHost go={go} openPaths={/^\/(?:gate|kiosk)(?:\/|$)/} />);
    for (const path of ["/gate/12", "/kiosk", "/login"]) {
      at(path);
      ended();
    }
    expect(go).not.toHaveBeenCalled();
  });

  it("only counts work as unsaved while it is", () => {
    const go = vi.fn();
    const { rerender } = render(
      <>
        <Editor dirty />
        <SessionEndHost go={go} />
      </>,
    );
    rerender(
      <>
        <Editor dirty={false} />
        <SessionEndHost go={go} />
      </>,
    );
    at("/events");
    ended();
    expect(go).toHaveBeenCalledWith("/login?next=%2Fevents");
    expect(signInAgainPath({ pathname: "/", search: "" })).toBe("/login");
  });
});
