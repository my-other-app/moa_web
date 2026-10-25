import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import type { FakeState } from "@/test/fake-api";

/** The background jobs: the queue per name, then the failed and stuck jobs with retry and cancel. */
const state = vi.hoisted<FakeState>(() => ({ role: "owner", ops: null, calls: [], handlers: {} }));

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  const { fakeApi } = await import("@/test/fake-api");
  return {
    ...actual,
    useSession: () => ({ data: { id: 1, username: "admin", email: "a@b.c", full_name: "Admin", user_type: "admin", admin_role: state.role } }),
    api: fakeApi(state),
  };
});

const { render } = await import("@/test/render");
const { freshState, callsOf } = await import("@/test/fake-api");
const { JobsPage } = await import("./index");

const job = (over: Record<string, unknown> = {}) => ({
  id: 41,
  name: "emails.send",
  state: "dead",
  attempts: 6,
  max_attempts: 6,
  error: "SES throttled the request",
  run_at: null,
  last_run_at: "2026-10-24T00:00:00Z",
  created_at: null,
  locked_by: null,
  locked_until: null,
  priority: 0,
  ...over,
});

beforeEach(() => {
  freshState(state);
  state.handlers["GET /api/v1/admin/jobs"] = () => ({
    queues: [{ name: "emails.send", due: 3, scheduled: 0, running: 1, abandoned: 2, oldest_due_seconds: 12, dead: 1 }],
    workers: [{ id: "w1", kind: "api", host: "h", running: 1, handled: 10, failed: 1, beat_at: "2026-10-24T00:00:00Z" }],
    mode: "in-process",
  });
  state.handlers["GET /api/v1/admin/jobs/items"] = ({ query }) => ({
    items: query?.state === "stuck" ? [job({ id: 42, state: "stuck", name: "push.fanout", error: null })] : [job()],
    total: 1,
    counts: { dead: 1, failing: 0, stuck: 1 },
    state: query?.state,
    stuck_after_minutes: 10,
    offset: 0,
    limit: 50,
  });
  state.handlers["POST /api/v1/admin/jobs/41/retry"] = () => ({ id: 41, requeued: true });
  state.handlers["POST /api/v1/admin/jobs/41/cancel"] = () => ({ id: 41, cancelled: true });
});

describe("the jobs page", () => {
  it("shows the queue per name and whether anything runs it", async () => {
    render(<JobsPage />);
    expect(await screen.findByText(/1 runner heard from/)).toBeInTheDocument();
    expect(screen.getAllByText("emails.send").length).toBeGreaterThan(0);
  });

  it("lists the failed jobs with their error and tries", async () => {
    render(<JobsPage />);
    expect(await screen.findByText("SES throttled the request")).toBeInTheDocument();
    expect(screen.getByText("6/6")).toBeInTheDocument();
    expect(callsOf(state, "GET", "/api/v1/admin/jobs/items")[0]!.query).toMatchObject({ state: "dead" });
  });

  it("switches to the stuck ones", async () => {
    render(<JobsPage />);
    await screen.findByText("SES throttled the request");
    fireEvent.click(screen.getByRole("radio", { name: /Stuck/ }));
    expect(await screen.findByText("push.fanout")).toBeInTheDocument();
  });

  it("retries a failed job", async () => {
    render(<JobsPage />);
    await screen.findByText("SES throttled the request");
    fireEvent.click(screen.getByRole("button", { name: /Retry/ }));
    await waitFor(() => expect(callsOf(state, "POST", "/api/v1/admin/jobs/41/retry")).toHaveLength(1));
  });

  it("cancels one after a confirmation", async () => {
    render(<JobsPage />);
    await screen.findByText("SES throttled the request");
    fireEvent.click(screen.getByRole("button", { name: /Cancel/ }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel job" }));
    await waitFor(() => expect(callsOf(state, "POST", "/api/v1/admin/jobs/41/cancel")).toHaveLength(1));
  });

  it("offers a viewer no retry or cancel", async () => {
    state.role = "viewer";
    render(<JobsPage />);
    await screen.findByText("SES throttled the request");
    expect(screen.queryByRole("button", { name: /Retry/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Cancel/ })).toBeNull();
  });

  it("shows only the queue on a backend without the job list", async () => {
    state.ops = null;
    render(<JobsPage />);
    expect(await screen.findByText(/1 runner heard from/)).toBeInTheDocument();
    await waitFor(() => expect(state.calls.some((c) => c.path === "/api/v1/admin/ops/me")).toBe(true));
    expect(screen.queryByText("Failed and stuck jobs")).toBeNull();
    expect(callsOf(state, "GET", "/api/v1/admin/jobs/items")).toEqual([]);
  });
});
