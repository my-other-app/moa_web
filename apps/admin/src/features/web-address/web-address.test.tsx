import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import type { FakeState } from "@/test/fake-api";

/**
 * A club's or an event's web address, changed by an admin when the club
 * asks (feature-register/mail-and-slugs-contract.md, Part S):
 * PATCH /admin/clubs/{id}/slug and /admin/events/{id}/slug answer
 * {slug, aliases, url, site_url}; the admin GETs list `slug_aliases`.
 * Owners and support (MODERATE); a viewer only sees it.
 */
const state = vi.hoisted<FakeState>(() => ({ role: "owner", ops: null, calls: [], handlers: {} }));

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  const { fakeApi } = await import("@/test/fake-api");
  return {
    ...actual,
    useSession: () => ({ data: { id: 1, username: "a", email: "a@x.in", full_name: "Asha", user_type: "admin", admin_role: state.role }, isPending: false }),
    api: fakeApi(state),
  };
});

const { render } = await import("@/test/render");
const { freshState, callsOf, routeMissing, refusal } = await import("@/test/fake-api");
const { WebAddressCard, slugProblem, slugChangeSchema } = await import("./index");
const { useClub } = await import("@/features/clubs/queries");
const { adminClubDetailSchema } = await import("@/features/clubs/schemas");
const { adminEventDetailSchema } = await import("@/features/events/schemas");

const CLUB = { id: 5, name: "GDG Cloud Trivandrum", slug: "gdg-cloud-tvm", slug_aliases: ["gdgtvm"], is_verified: true };

/** The club as the server keeps it: a change moves the old slug to the front of its aliases. */
function serveClub() {
  const club = { ...CLUB, slug_aliases: [...CLUB.slug_aliases] };
  state.handlers["GET /api/v1/clubs/admin/5"] = () => club;
  state.handlers["PATCH /api/v1/admin/clubs/5/slug"] = (c) => {
    const slug = (c.body as { slug: string }).slug;
    club.slug_aliases = [club.slug, ...club.slug_aliases.filter((a) => a !== slug)];
    club.slug = slug;
    return { slug, aliases: club.slug_aliases, url: `https://myotherapp.in/clubs/${slug}`, site_url: `https://${slug}.myotherapp.in` };
  };
}

function ClubAddress() {
  const { data } = useClub(5);
  return data ? <WebAddressCard kind="club" id={5} slug={data.slug} aliases={data.slug_aliases} /> : null;
}

beforeEach(() => {
  freshState(state);
  serveClub();
  state.handlers["PATCH /api/v1/admin/events/9/slug"] = (c) => {
    const slug = (c.body as { slug: string }).slug;
    return { slug, aliases: ["devfest"], url: `https://myotherapp.in/events/${slug}`, site_url: null };
  };
});

describe("the rules, before asking", () => {
  it("says what's wrong with a slug as the server would", () => {
    expect(slugProblem("club", "")).toBeNull();
    expect(slugProblem("club", "ab")).toMatch(/3 to 60/);
    expect(slugProblem("club", "-gdg")).toMatch(/starting and ending/);
    expect(slugProblem("club", "gdg_tvm")).toMatch(/lower-case letters, numbers and hyphens/);
    expect(slugProblem("club", "gdg--tvm")).toMatch(/two hyphens/);
    expect(slugProblem("event", "2026")).toMatch(/only numbers/);
    expect(slugProblem("club", "GDG-Cloud-TVM")).toBeNull();
    // A club's slug is a subdomain: the platform's names aren't free; an event's may use them.
    expect(slugProblem("club", "admin")).toMatch(/kept for the platform/);
    expect(slugProblem("club", "sites")).toMatch(/kept for the platform/);
    expect(slugProblem("event", "admin")).toBeNull();
  });

  it("reads the change's answer, and old slugs from a detail (none from an older server, or a null)", () => {
    expect(slugChangeSchema.parse({ slug: "a-b", aliases: null })).toEqual({ slug: "a-b", aliases: [], url: null, site_url: null });
    expect(adminClubDetailSchema.parse({ id: 1, name: "x" }).slug_aliases).toEqual([]);
    expect(adminEventDetailSchema.parse({ id: 1, name: "x", slug_aliases: null }).slug_aliases).toEqual([]);
    expect(adminEventDetailSchema.parse({ id: 1, name: "x", slug_aliases: ["old"] }).slug_aliases).toEqual(["old"]);
  });
});

describe("a club's web address", () => {
  it("shows the slug, its public page and its site, and the old ones that still send people here", async () => {
    render(<ClubAddress />);
    const card = await screen.findByRole("region", { name: "Web address" });
    expect(within(card).getByText("gdg-cloud-tvm", { selector: "code" })).toBeInTheDocument();
    const where = within(card).getByRole("list", { name: "Where it is" });
    expect(within(where).getByRole("link", { name: /myotherapp.in\/clubs\/gdg-cloud-tvm/ })).toHaveAttribute("href", "https://myotherapp.in/clubs/gdg-cloud-tvm");
    expect(within(where).getByRole("link", { name: /gdg-cloud-tvm.myotherapp.in/ })).toHaveAttribute("href", "https://gdg-cloud-tvm.myotherapp.in");
    expect(within(card).getByRole("list", { name: "Old addresses" })).toHaveTextContent("gdgtvm");
  });

  it("changes it for owners and support, and shows the new one with the old ones at once", async () => {
    for (const role of ["owner", "support"]) {
      freshState(state, { role });
      serveClub();
      const view = render(<ClubAddress />);
      const card = await screen.findByRole("region", { name: "Web address" });
      fireEvent.click(within(card).getByRole("button", { name: /Change/ }));
      const form = within(card).getByRole("form", { name: "Change the web address" });
      const input = within(form).getByLabelText("New web address");
      expect(input).toHaveValue("gdg-cloud-tvm");
      expect(within(form).getByText(/old address keeps working for good/)).toBeInTheDocument();
      fireEvent.change(input, { target: { value: "ab" } });
      expect(within(form).getByRole("alert")).toHaveTextContent("A web address is 3 to 60 characters.");
      expect(within(form).getByRole("button", { name: "Change" })).toBeDisabled();
      fireEvent.change(input, { target: { value: "GDG-Trivandrum" } });
      fireEvent.click(within(form).getByRole("button", { name: "Change" }));
      await waitFor(() => expect(callsOf(state, "PATCH", "/api/v1/admin/clubs/5/slug")[0]?.body).toEqual({ slug: "gdg-trivandrum" }));
      await waitFor(() => expect(within(card).getByText("gdg-trivandrum", { selector: "code" })).toBeInTheDocument());
      expect(within(card).getByRole("list", { name: "Old addresses" })).toHaveTextContent("gdg-cloud-tvm");
      expect(within(card).queryByRole("form")).toBeNull();
      view.unmount();
    }
  });

  it("is only shown to a viewer", async () => {
    state.role = "viewer";
    render(<ClubAddress />);
    const card = await screen.findByRole("region", { name: "Web address" });
    expect(within(card).queryByRole("button", { name: /Change/ })).toBeNull();
  });

  it.each([
    [() => refusal(409, "", "SLUG_TAKEN"), "That address is taken. Pick another."],
    [() => refusal(422, "", "SLUG_RESERVED"), "That address is kept for the platform. Pick another."],
    [() => refusal(422, "A web address can't be only numbers.", "SLUG_INVALID"), "A web address can't be only numbers."],
    [() => routeMissing(), "Changing a web address isn't available on this server yet."],
  ])("says a refusal in words (%#)", async (refuse, words) => {
    state.handlers["PATCH /api/v1/admin/clubs/5/slug"] = () => {
      throw refuse();
    };
    render(<ClubAddress />);
    const card = await screen.findByRole("region", { name: "Web address" });
    fireEvent.click(within(card).getByRole("button", { name: /Change/ }));
    const form = within(card).getByRole("form", { name: "Change the web address" });
    fireEvent.change(within(form).getByLabelText("New web address"), { target: { value: "gdg-trivandrum" } });
    fireEvent.click(within(form).getByRole("button", { name: "Change" }));
    expect(await within(form).findByText(words)).toBeInTheDocument();
  });
});

describe("an event's web address", () => {
  it("has its page and no site, and changes through the events route", async () => {
    render(<WebAddressCard kind="event" id={9} slug="devfest-2026" aliases={[]} />);
    const card = await screen.findByRole("region", { name: "Web address" });
    const where = within(card).getByRole("list", { name: "Where it is" });
    expect(within(where).getAllByRole("link")).toHaveLength(1);
    expect(within(where).getByRole("link")).toHaveAttribute("href", "https://myotherapp.in/events/devfest-2026");
    expect(within(card).queryByRole("list", { name: "Old addresses" })).toBeNull();
    fireEvent.click(within(card).getByRole("button", { name: /Change/ }));
    const form = within(card).getByRole("form", { name: "Change the web address" });
    fireEvent.change(within(form).getByLabelText("New web address"), { target: { value: "devfest-tvm-2026" } });
    fireEvent.click(within(form).getByRole("button", { name: "Change" }));
    await waitFor(() => expect(callsOf(state, "PATCH", "/api/v1/admin/events/9/slug")[0]?.body).toEqual({ slug: "devfest-tvm-2026" }));
  });
});
