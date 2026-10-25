import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { toast } from "@moa/ui";

import type { FakeState } from "@/test/fake-api";

/**
 * A push to every device: compose, the audience (every device, counted), a
 * preview, and a confirmation naming the count before anything goes. Owners
 * only; the server allows two an hour. And whether pushes work at all.
 */
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
const { freshState, callsOf, refusal } = await import("@/test/fake-api");
const { PushPage, sendRefusal, pushInputSchema } = await import("./index");

beforeEach(() => {
  freshState(state);
  vi.restoreAllMocks();
  state.handlers["GET /api/v1/notifications/test/tokens"] = () => ({ count: 1234, tokens: [] });
  state.handlers["GET /api/v1/notifications/topics/adoption"] = () => ({ devices: 1234, topic_devices: 617, share: 0.5, by_platform: {}, push_topics: false, push_topics_legacy: true });
  state.handlers["GET /api/v1/notifications/test/firebase-status"] = () => ({ has_path_config: false, has_base64_config: true, base64_length: 10, firebase_initialized: true, error: null, project_id: "moa-prod" });
  state.handlers["POST /api/v1/notifications/test/send-all"] = () => ({ success: true, tokens_count: 1234, sent_count: 0, message: "Sending to 1234 devices" });
});

async function compose(title = "Fest week", body = "Registrations open today") {
  render(<PushPage />);
  fireEvent.change(await screen.findByLabelText("Title"), { target: { value: title } });
  fireEvent.change(screen.getByLabelText("Message"), { target: { value: body } });
  await screen.findByText(/1,234 registered devices/);
  fireEvent.click(screen.getByRole("button", { name: /Review and send/ }));
}

describe("a push to everyone", () => {
  it("previews what it says, and names how many devices before it is sent", async () => {
    await compose();
    expect(within(screen.getByRole("figure", { name: "Preview" })).getByText("Fest week")).toBeInTheDocument();
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByRole("heading")).toHaveTextContent("Send to 1,234 devices?");
    expect(callsOf(state, "POST")).toEqual([]);
    fireEvent.click(within(dialog).getByRole("button", { name: "Send to 1,234 devices" }));
    await waitFor(() => expect(callsOf(state, "POST", "/api/v1/notifications/test/send-all")[0]!.body).toEqual({ title: "Fest week", body: "Registrations open today" }));
  });

  it("says plainly when the hour's two are used up", async () => {
    const error = vi.spyOn(toast, "error");
    state.handlers["POST /api/v1/notifications/test/send-all"] = () => {
      throw refusal(429, "Rate limit exceeded");
    };
    await compose();
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /Send to/ }));
    await waitFor(() => expect(error).toHaveBeenCalledWith(expect.stringMatching(/two pushes to everyone are allowed an hour/)));
    expect(sendRefusal(new Error("boom"))).toBe("boom");
  });

  it("will not review a message without a title", async () => {
    render(<PushPage />);
    fireEvent.change(await screen.findByLabelText("Message"), { target: { value: "Body only" } });
    fireEvent.click(screen.getByRole("button", { name: /Review and send/ }));
    expect(await screen.findByText("Write a title")).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(pushInputSchema.safeParse({ title: "t", body: "b", image_url: "http://x.in/a.png" }).success).toBe(false);
    expect(pushInputSchema.safeParse({ title: "t", body: "b", image_url: "" }).success).toBe(true);
  });

  it("is not offered to support, who still sees whether pushes work", async () => {
    state.role = "support";
    render(<PushPage />);
    expect(await screen.findByText(/Only an owner can push to everyone/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Title")).toBeNull();
    expect(await screen.findByText(/Connected to moa-prod/)).toBeInTheDocument();
    expect(await screen.findByText(/617 of 1,234 devices \(50%\)/)).toBeInTheDocument();
  });

  it("says what is wrong when Firebase is not working", async () => {
    state.handlers["GET /api/v1/notifications/test/firebase-status"] = () => ({ has_path_config: false, has_base64_config: false, firebase_initialized: false, error: null });
    render(<PushPage />);
    expect(await screen.findByText(/no service account is set/)).toBeInTheDocument();
  });
});
