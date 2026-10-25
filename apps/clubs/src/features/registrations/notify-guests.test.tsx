import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

/**
 * Notify guests, on the event's Overview: a push to this event's guests,
 * titled with the event's name, to the audience picked, after one look at
 * exactly what goes out. event-screen.test.tsx covers the button staying off
 * until something is written and the audience figures; these cover the send.
 */
const posts: Array<{ path: string; body: unknown }> = [];
const audience = {
  event: { id: 37, name: "Hack Night 04" },
  registered: 148,
  checked_in: 88,
  reachable: 120,
  by_audience: { all: { people: 148, reachable: 120 }, attendees: { people: 88, reachable: 71 }, non_attendees: { people: 60, reachable: 0 } },
};
const state: { reply: unknown } = { reply: { success: true, notifications_sent: 71 } };

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        if (path === "/api/v1/clubs/notifications/events/37/audience") return audience;
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body: unknown) => {
        posts.push({ path, body });
        return state.reply;
      }),
      put: vi.fn(),
      patch: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { toast } = await import("@moa/ui");
const { render } = await import("@/test/render");
const { NotifyGuestsPanel } = await import("./components/notify-guests-panel");

beforeEach(() => {
  posts.length = 0;
  state.reply = { success: true, notifications_sent: 71 };
  vi.restoreAllMocks();
});

const SEND = "/api/v1/clubs/notifications/events/37/send";

async function write(text: string, name = "Hack Night 04") {
  render(<NotifyGuestsPanel eventId={37} eventName={name} recipientCount={148} />);
  // The reach for "Everyone" arrives first; the button names it.
  await screen.findByRole("button", { name: "Send to 120 phones" });
  fireEvent.change(screen.getByLabelText("Message"), { target: { value: text } });
}

describe("notifying an event's guests", () => {
  it("asks first, with who gets it, the title and the very words, and sends nothing on Keep writing", async () => {
    await write("  We've moved to Hall B — same time.  ");
    fireEvent.click(screen.getByRole("radio", { name: "Checked in" }));
    fireEvent.click(await screen.findByRole("button", { name: "Send to 71 phones" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByRole("heading", { name: "Send this to 71 phones?" })).toBeInTheDocument();
    expect(within(dialog).getByText(/Guests already checked in for Hack Night 04/)).toHaveTextContent("titled “Hack Night 04” and cannot be recalled");
    expect(within(dialog).getByText("We've moved to Hall B — same time.")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Keep writing" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(posts).toHaveLength(0);
    expect(screen.getByLabelText("Message")).toHaveValue("  We've moved to Hall B — same time.  ");
  });

  it("sends the trimmed message to the audience picked, titled with the event, says how many phones, and clears", async () => {
    const said = vi.spyOn(toast, "success");
    await write("  We've moved to Hall B — same time.  ");
    fireEvent.click(screen.getByRole("radio", { name: "Checked in" }));
    fireEvent.click(await screen.findByRole("button", { name: "Send to 71 phones" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Send notification" }));

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toEqual({ path: SEND, body: { title: "Hack Night 04", body: "We've moved to Hall B — same time.", audience: "attendees" } });
    await waitFor(() => expect(said).toHaveBeenCalledWith("Announcement sent to 71 phones"));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(screen.getByLabelText("Message")).toHaveValue("");
  });

  it("sends to everyone on the list unless another audience is picked", async () => {
    await write("Doors open at 6.");
    fireEvent.click(screen.getByRole("button", { name: "Send to 120 phones" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Send notification" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]!.body).toMatchObject({ audience: "all" });
  });

  it("pads a title too short for the endpoint rather than having it refused", async () => {
    await write("Doors open at 6.", "AI");
    expect(screen.getByText(/titled “AI update”/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Send to 120 phones" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Send notification" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]!.body).toMatchObject({ title: "AI update" });
  });

  it("keeps the dialog and the message, and says why, when the server will not send", async () => {
    const said = vi.spyOn(toast, "error");
    // The endpoint says no with a 200 and a reason.
    state.reply = { success: false, message: "Nobody registered has the app installed" };
    await write("Doors open at 6.");
    fireEvent.click(screen.getByRole("button", { name: "Send to 120 phones" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Send notification" }));

    await waitFor(() => expect(said).toHaveBeenCalledWith("Nobody registered has the app installed"));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Message")).toHaveValue("Doors open at 6.");
  });

  it("will not send under five characters", async () => {
    await write("Hi");
    expect(screen.getByText("Write at least 5 characters.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send to 120 phones" })).toBeDisabled();
  });

  it("will not send to an audience nobody in which has the app, and points to email instead", async () => {
    await write("Doors open at 6.");
    fireEvent.click(screen.getByRole("radio", { name: "Not yet in" }));
    expect(await screen.findByText(/the push would reach no one\. An email from Messages would\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send to 0 phones" })).toBeDisabled();
  });
});
