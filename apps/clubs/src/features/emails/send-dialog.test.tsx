import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

/**
 * Sending a template now: one press of Send is one send, whatever happens to
 * the answer. The press's key (clientRef) is the same on a retry of it, so
 * the API mails nobody twice; a send that went through starts a new key.
 */
const posts: Array<{ path: string; body?: unknown }> = [];
let failNext = false;

const sent = { id: "m1", kind: "TEMPLATE", templateId: "t1", scheduled: false, subject: "Invite", body: "", audience: "ALL", roles: [], channels: ["email"], status: "SENDING", recipients: 2, sentCount: 0, failedCount: 0, skippedCount: 0, createdAt: "2026-10-18T00:00:00Z", createdByName: "Ananya" };

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async () => ({})),
      post: vi.fn(async (path: string, body?: unknown) => {
        if (path.endsWith("/emails/audience")) return { recipients: 2, withoutEmail: 0 };
        posts.push({ path, body });
        if (failNext) {
          failNext = false;
          // The answer was lost on the way back: the click is retried.
          throw new TypeError("Failed to fetch");
        }
        return sent;
      }),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { SendTemplateDialog } = await import("./components/send-dialog");
const { emailTemplateFieldsSchema } = await import("./schemas");

const template = { ...emailTemplateFieldsSchema.parse({ name: "Invite", subject: "Your ticket" }), id: "t1" };
const sends = () => posts.filter((p) => p.path === "/api/v1/events/42/emails/t1/send");
const refOf = (i: number) => (sends()[i]?.body as { clientRef?: string } | undefined)?.clientRef;

beforeEach(() => {
  posts.length = 0;
  failNext = false;
});

describe("sending a template now", () => {
  it("keeps one key across a retried press, and starts a new one after a send", async () => {
    failNext = true;
    const onOpenChange = vi.fn();
    render(<SendTemplateDialog eventId={42} template={template} open onOpenChange={onOpenChange} />);
    const dialog = await screen.findByRole("alertdialog");
    const send = await within(dialog).findByRole("button", { name: "Send to 2" });

    fireEvent.click(send);
    await waitFor(() => expect(sends()).toHaveLength(1));
    await waitFor(() => expect(send).not.toBeDisabled());
    fireEvent.click(send);
    await waitFor(() => expect(sends()).toHaveLength(2));
    expect(refOf(0)).toMatch(/^[0-9a-f-]{36}$/);
    expect(refOf(1)).toBe(refOf(0));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));

    // The same template sent again later is a new send.
    fireEvent.click(send);
    await waitFor(() => expect(sends()).toHaveLength(3));
    expect(refOf(2)).not.toBe(refOf(0));
  });
});
