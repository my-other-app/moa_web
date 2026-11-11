import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";

/**
 * "Give your ticket back" (ticket-self-cancel-contract.md): the editor's
 * checker knows {{cancel_ticket_url}}, and the insert menu offers the line
 * only where the server's token list has the token.
 */
const { render } = await import("@/test/render");
const { TokenMenu, problemsOf } = await import("./components/kit");

const ticketTokens = [
  { key: "ticket_url", group: "Links", label: "Ticket link", sample: "https://myotherapp.in/t/…" },
  { key: "cancel_ticket_url", group: "Links", label: "Give your ticket back", sample: "https://myotherapp.in/tickets/cancel?t=…" },
];

const open = () => fireEvent.keyDown(screen.getByRole("button", { name: /Insert token/ }), { key: "Enter" });

describe("the cancel-ticket link", () => {
  it("is a token the editor knows", () => {
    expect(problemsOf("Can't come? [Give your ticket back]({{cancel_ticket_url}})")).toEqual([]);
    expect(problemsOf("{{cancel_ticket_link}}")).not.toEqual([]);
  });

  it("is offered as a ready line where the server lists it", async () => {
    const onInsert = vi.fn();
    render(<TokenMenu onInsert={onInsert} tokens={ticketTokens} samples={{}} />);
    open();
    fireEvent.click(await screen.findByRole("menuitem", { name: "A link to give their ticket back" }));
    expect(onInsert).toHaveBeenCalledWith("Can't come? [Give your ticket back]({{cancel_ticket_url}})");
  });

  it("is not offered where the server does not list it", async () => {
    render(<TokenMenu onInsert={vi.fn()} tokens={ticketTokens.slice(0, 1)} samples={{}} />);
    open();
    expect(await screen.findByRole("menuitem", { name: "A link to the ticket" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "A link to give their ticket back" })).toBeNull();
  });
});
