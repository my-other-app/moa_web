import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import type { FakeState } from "@/test/fake-api";

/**
 * The admin's speakers directory: the menu item that waits for the API, the
 * list's filters, a profile's content-rights actions (remove on request asks
 * first), "Make a lead" filled in from the headline, and the merge queue side
 * by side with merge and "Different people".
 */
const state = vi.hoisted<FakeState>(() => ({ role: "owner", ops: null, calls: [], handlers: {} }));
const me = vi.hoisted(() => ({ id: 1 }));

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  const { fakeApi } = await import("@/test/fake-api");
  return {
    ...actual,
    useSession: () => ({ data: { id: me.id, username: "a", email: "a@x.in", full_name: "Asha", user_type: "admin", admin_role: state.role } }),
    api: fakeApi(state),
  };
});

const { render } = await import("@/test/render");
const { freshState, callsOf, routeMissing } = await import("@/test/fake-api");
const { SidebarNav } = await import("@/components/sidebar-nav");
const { SpeakersPage, SpeakerPage, DuplicatesPage, orgFromHeadline, makeLeadHref } = await import("./index");

const row = (over: Record<string, unknown> = {}) => ({
  id: 7,
  slug: "ananya-iyer",
  name: "Ananya Iyer",
  headline: "Head of Research · IIT-M",
  photo: null,
  city: "Chennai",
  topics: [{ id: 2, name: "Tech", slug: "tech" }],
  talks_count: 3,
  clubs: [{ id: 5, name: "Circuit" }],
  last_talk_at: "2026-10-04T10:00:00Z",
  status: "active",
  claimed: false,
  links: { linkedin: "https://linkedin.com/in/ananya" },
  ...over,
});

const detail = (over: Record<string, unknown> = {}) => ({
  ...row(),
  bio: "Leads the robotics lab.",
  talks: [{ event_id: 77, event_name: "DevFest 2026", slug: "devfest", date: "2026-10-04T10:00:00Z", talk_title: "Rovers", status: "published", club: { id: 5, name: "Circuit" }, sessions: [] }],
  contacts: [{ club: { id: 5, name: "Circuit" }, email: "ananya@iitm.ac.in", phone: null, consent_at: "2026-10-01T00:00:00Z", consent_by: "Riya" }],
  history: [{ id: 1, action: "created", actor_kind: "club", actor_name: "Circuit", created_at: "2026-09-01T00:00:00Z" }],
  merged_from: [],
  merged_into: null,
  created_by_club: { id: 5, name: "Circuit" },
  claimed_by: null,
  followers_count: 0,
  invites: [],
  page_url: "https://myotherapp.in/speakers/ananya-iyer",
  ...over,
});

const side = (id: number, name: string, club: string) => ({ ...row({ id, name, clubs: [{ id, name: club }] }), bio: null, talks: [{ event_id: id * 10, event_name: `${club} night`, date: null, club: { id, name: club } }] });

beforeEach(() => {
  freshState(state);
  me.id = 1;
  state.handlers["GET /api/v1/admin/reports"] = () => ({ items: [], total: 0 });
  state.handlers["GET /api/v1/admin/teamwork/badge"] = () => {
    throw routeMissing();
  };
  state.handlers["GET /api/v1/admin/speakers"] = () => ({ items: [row()], total: 1, page: 1, page_size: 50 });
  state.handlers["GET /api/v1/admin/speakers/7"] = () => detail();
  state.handlers["GET /api/v1/admin/speakers/duplicates"] = () => [{ id: 3, a: side(7, "Ananya Iyer", "Circuit"), b: side(8, "Ananya Iyer", "Robotics Club"), reason: "same_name_other_club", score: 0.8, status: "open" }];
});

describe("Speakers in the side menu", () => {
  it("shows once the API has the directory", async () => {
    render(<SidebarNav />);
    expect(await screen.findByRole("link", { name: "Speakers" })).toHaveAttribute("href", "/speakers");
  });

  it("stays out on an API without it", async () => {
    state.handlers["GET /api/v1/admin/speakers"] = () => {
      throw routeMissing();
    };
    render(<SidebarNav />);
    expect(await screen.findByRole("link", { name: "Users" })).toBeInTheDocument();
    await waitFor(() => expect(callsOf(state, "GET", "/api/v1/admin/speakers").length).toBeGreaterThan(0));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole("link", { name: "Speakers" })).toBeNull();
  });
});

describe("the list", () => {
  it("shows each speaker with their talks and clubs, and filters by what is picked", async () => {
    state.handlers["GET /api/v1/interests/categories"] = () => [];
    render(<SpeakersPage />);
    expect(await screen.findByRole("link", { name: /Ananya Iyer/ })).toHaveAttribute("href", "/speakers/7");
    expect(screen.getByText("Circuit")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "hidden" } });
    fireEvent.change(screen.getByLabelText("Claimed"), { target: { value: "yes" } });
    await waitFor(() => expect(callsOf(state, "GET", "/api/v1/admin/speakers").at(-1)!.query).toMatchObject({ status: "hidden", claimed: true, page: 1 }));
    expect(await screen.findByRole("link", { name: /Merge queue · 1/ })).toHaveAttribute("href", "/speakers/duplicates");
    expect(screen.getByRole("button", { name: /Export to Excel/ })).toBeInTheDocument();
  });
});

describe("a profile", () => {
  it("shows the talks, each club's contact and the history", async () => {
    render(<SpeakerPage speakerId={7} />);
    expect(await screen.findByRole("link", { name: "DevFest 2026" })).toHaveAttribute("href", "/events/77");
    expect(screen.getByText("ananya@iitm.ac.in")).toBeInTheDocument();
    expect(screen.getByText("Profile made")).toBeInTheDocument();
  });

  it("asks before removing a speaker on request, then removes", async () => {
    state.handlers["POST /api/v1/admin/speakers/7/remove-on-request"] = () => ({ id: 7, status: "hidden", contacts_deleted: 1 });
    render(<SpeakerPage speakerId={7} />);
    fireEvent.click(await screen.findByRole("button", { name: /Remove on request/ }));
    expect(await screen.findByText(/every club's email, phone and notes for them are deleted/)).toBeInTheDocument();
    expect(callsOf(state, "POST")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(callsOf(state, "POST", "/api/v1/admin/speakers/7/remove-on-request")).toHaveLength(1));
  });

  it("offers no changes to an admin without content rights", async () => {
    state.role = "support";
    render(<SpeakerPage speakerId={7} />);
    await screen.findByRole("link", { name: "DevFest 2026" });
    for (const name of [/Hide/, /Remove on request/, /Invite to claim/, /Edit profile/]) expect(screen.queryByRole("button", { name })).toBeNull();
    expect(screen.queryByLabelText(/photo/)).toBeNull();
  });

  it("offers Unmerge on a merged profile", async () => {
    state.handlers["GET /api/v1/admin/speakers/7"] = () => detail({ status: "merged", merged_into: { id: 9, slug: "a", name: "Ananya I." } });
    state.handlers["POST /api/v1/admin/speakers/7/unmerge"] = () => ({ id: 7, status: "active" });
    render(<SpeakerPage speakerId={7} />);
    expect(await screen.findByRole("link", { name: "Ananya I." })).toHaveAttribute("href", "/speakers/9");
    fireEvent.click(screen.getByRole("button", { name: /Unmerge/ }));
    await waitFor(() => expect(callsOf(state, "POST", "/api/v1/admin/speakers/7/unmerge")).toHaveLength(1));
  });

  it("offers no Make a lead on an API without Team work", async () => {
    render(<SpeakerPage speakerId={7} />);
    await screen.findByRole("link", { name: "DevFest 2026" });
    await waitFor(() => expect(callsOf(state, "GET", "/api/v1/admin/teamwork/badge")).toHaveLength(1));
    expect(screen.queryByRole("link", { name: /Make a lead/ })).toBeNull();
  });

  it("links Make a lead to the new-lead form filled in from the headline, with no contact details", async () => {
    state.handlers["GET /api/v1/admin/teamwork/badge"] = () => ({ due: 0, overdue: 0, cases: 0 });
    render(<SpeakerPage speakerId={7} />);
    const link = await screen.findByRole("link", { name: /Make a lead/ });
    const url = new URL(link.getAttribute("href")!, "http://x");
    expect(url.pathname).toBe("/teamwork/leads");
    expect(Object.fromEntries(url.searchParams)).toEqual({ new: "1", type: "sponsor", source: "speaker", name: "IIT-M" });
  });

  it("offers Make a lead to a Sales member, and not to another admin outside the owners", async () => {
    state.role = "viewer";
    me.id = 3;
    state.handlers["GET /api/v1/admin/teamwork/badge"] = () => ({ due: 0, overdue: 0, cases: 0 });
    state.handlers["GET /api/v1/admin/teams"] = () => [{ key: "sales", members: [{ user_id: 3 }] }];
    const first = render(<SpeakerPage speakerId={7} />);
    expect(await screen.findByRole("link", { name: /Make a lead/ })).toBeInTheDocument();
    first.unmount();
    me.id = 4;
    render(<SpeakerPage speakerId={7} />);
    await screen.findByRole("link", { name: "DevFest 2026" });
    await waitFor(() => expect(callsOf(state, "GET", "/api/v1/admin/teams").length).toBeGreaterThan(1));
    expect(screen.queryByRole("link", { name: /Make a lead/ })).toBeNull();
  });

  it("reads the organisation out of a headline, whatever joins it", () => {
    expect(orgFromHeadline("Head of Research · IIT-M")).toBe("IIT-M");
    expect(orgFromHeadline("Engineer at Acme Labs")).toBe("Acme Labs");
    expect(orgFromHeadline("PM @ Zoho")).toBe("Zoho");
    expect(orgFromHeadline("Founder, Brew & Co")).toBe("Brew & Co");
    expect(orgFromHeadline("Independent researcher")).toBe("");
    expect(makeLeadHref(null)).toBe("/teamwork/leads?new=1&type=sponsor&source=speaker");
  });
});

describe("editing a profile", () => {
  const TREE = [
    { id: 2, name: "Tech", slug: "tech", interests: [] },
    { id: 3, name: "Design", slug: "design", interests: [] },
  ];
  const open = async () => {
    state.handlers["GET /api/v1/interests/list"] = () => TREE;
    render(<SpeakerPage speakerId={7} />);
    fireEvent.click(await screen.findByRole("button", { name: /Edit profile/ }));
    return screen.findByRole("dialog", { name: "Edit Ananya Iyer" });
  };

  it("opens filled in, and sends only what changed: an emptied field clears, links go as a set", async () => {
    state.handlers["PATCH /api/v1/admin/speakers/7"] = ({ body }) => detail(body as Record<string, unknown>);
    const dialog = await open();
    expect(within(dialog).getByLabelText("Name")).toHaveValue("Ananya Iyer");
    expect(within(dialog).getByLabelText("LinkedIn")).toHaveValue("https://linkedin.com/in/ananya");
    const save = within(dialog).getByRole("button", { name: "Save profile" });
    // Nothing changed yet: nothing to save.
    expect(save).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Headline"), { target: { value: "Professor · IIT-M" } });
    fireEvent.change(within(dialog).getByLabelText("City"), { target: { value: " " } });
    fireEvent.change(within(dialog).getByLabelText("Website"), { target: { value: "https://ananya.dev" } });
    fireEvent.click(await within(dialog).findByRole("button", { name: "Design" }));
    fireEvent.click(save);
    await waitFor(() => expect(callsOf(state, "PATCH", "/api/v1/admin/speakers/7")).toHaveLength(1));
    expect(callsOf(state, "PATCH", "/api/v1/admin/speakers/7")[0]!.body).toEqual({
      headline: "Professor · IIT-M",
      city: null,
      links: { website: "https://ananya.dev", linkedin: "https://linkedin.com/in/ananya" },
      topics: [2, 3],
    });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit Ananya Iyer" })).toBeNull());
  });

  it("refuses a link that isn't a web address and an empty name before anything is sent", async () => {
    const dialog = await open();
    fireEvent.change(within(dialog).getByLabelText("GitHub"), { target: { value: "github.com/ananya" } });
    expect(within(dialog).getByText("A web address starting with https://")).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "" } });
    expect(within(dialog).getByText("A speaker needs a name.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save profile" })).toBeDisabled();
    expect(callsOf(state, "PATCH")).toHaveLength(0);
  });

  it("says a claimed profile is the speaker's own to keep", async () => {
    state.handlers["GET /api/v1/admin/speakers/7"] = () => detail({ claimed: true });
    const dialog = await open();
    expect(within(dialog).getByText(/keeps this profile up to date themselves/)).toBeInTheDocument();
  });

  it("uploads a new photo as soon as it is picked", async () => {
    state.handlers["PUT /api/v1/admin/speakers/7/photo"] = () => ({ id: 7, photo: { thumbnail: "https://cdn.test/s/7.thumbnail.png", medium: "https://cdn.test/s/7.medium.png" } });
    render(<SpeakerPage speakerId={7} />);
    const input = await screen.findByLabelText("Add a photo of Ananya Iyer");
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "ananya.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(callsOf(state, "PUT", "/api/v1/admin/speakers/7/photo")).toHaveLength(1));
    const sent = callsOf(state, "PUT", "/api/v1/admin/speakers/7/photo")[0]!.body as FormData;
    expect((sent.get("photo") as File).name).toBe("ananya.png");
  });

  it("offers neither on a merged profile", async () => {
    state.handlers["GET /api/v1/admin/speakers/7"] = () => detail({ status: "merged", merged_into: { id: 9, slug: "a", name: "Ananya I." } });
    render(<SpeakerPage speakerId={7} />);
    await screen.findByRole("link", { name: "Ananya I." });
    expect(screen.queryByRole("button", { name: /Edit profile/ })).toBeNull();
    expect(screen.queryByLabelText(/photo/)).toBeNull();
  });
});

describe("the merge queue", () => {
  it("shows a pair side by side, and merges the one not kept into the one kept after asking", async () => {
    state.handlers["POST /api/v1/admin/speakers/merge"] = () => ({ keep_id: 8, merged_id: 7 });
    render(<DuplicatesPage />);
    const pair = await screen.findByRole("listitem", { name: "Ananya Iyer and Ananya Iyer" });
    expect(within(pair).getByText("Same name, another club")).toBeInTheDocument();
    expect(within(pair).getByText("Circuit night")).toBeInTheDocument();
    expect(within(pair).getByText("Robotics Club night")).toBeInTheDocument();
    fireEvent.click(within(pair).getByRole("button", { name: /Keep Ananya Iyer \(right\)/ }));
    expect(callsOf(state, "POST")).toHaveLength(0);
    fireEvent.click(await screen.findByRole("button", { name: "Merge" }));
    await waitFor(() => expect(callsOf(state, "POST", "/api/v1/admin/speakers/merge")[0]?.body).toEqual({ keep_id: 8, merge_id: 7 }));
  });

  it("takes two different people out of the queue", async () => {
    state.handlers["POST /api/v1/admin/speakers/duplicates/3/dismiss"] = () => ({ id: 3, status: "dismissed" });
    render(<DuplicatesPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Different people/ }));
    await waitFor(() => expect(callsOf(state, "POST", "/api/v1/admin/speakers/duplicates/3/dismiss")).toHaveLength(1));
  });

  it("offers no decisions to an admin without content rights", async () => {
    state.role = "viewer";
    render(<DuplicatesPage />);
    await screen.findByText("Same name, another club");
    expect(screen.queryByRole("button", { name: /Keep/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Different people/ })).toBeNull();
  });
});
