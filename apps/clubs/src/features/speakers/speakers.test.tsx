import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@moa/api";

/**
 * The club's speakers: the picker that offers past speakers first, the
 * club's list with its private contact (an email or phone needs the tick
 * that the speaker agreed), and "apply to upcoming events".
 */
const calls: { method: string; path: string; body?: unknown; query?: Record<string, unknown> }[] = [];
const server = vi.hoisted(() => ({ old: false, contact: null as Record<string, unknown> | null }));
const routeMissing = () => new ApiError({ status: 404, message: "Not Found", routeMissing: true });

const ananya = {
  profile_id: 7,
  id: 7,
  slug: "ananya-iyer",
  name: "Ananya Iyer",
  headline: "Head of Research · IIT-M",
  photo: { thumbnail: "https://cdn.example/a-t.jpg", medium: "https://cdn.example/a-m.jpg" },
  bio: "Leads the robotics lab.",
  links: { website: "https://ananya.example", linkedin: "https://linkedin.com/in/ananya" },
  city: "Chennai",
  topics: [],
  status: "active",
  claimed: false,
  talks_count: 2,
  last_talk: { event_id: 77, event_name: "DevFest 2026", date: "2026-10-04T10:00:00Z" },
  own: true,
};

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  const record = (method: string) => async (path: string, bodyOrOptions?: unknown, options?: { query?: Record<string, unknown> }) => {
    const query = method === "GET" ? (bodyOrOptions as { query?: Record<string, unknown> } | undefined)?.query : options?.query;
    const body = method === "GET" ? undefined : bodyOrOptions;
    calls.push({ method, path, body, query });
    if (server.old) throw routeMissing();
    if (method === "GET" && path === "/api/v1/clubs/speakers") return [ananya, { ...ananya, profile_id: 9, id: 9, name: "Rahul Nair", own: false, claimed: true, last_talk: null }];
    if (method === "GET" && path === "/api/v1/clubs/speakers/list") return { items: [{ ...ananya, contact: server.contact }], total: 1, page: 1, page_size: 50 };
    if (method === "GET" && path === "/api/v1/clubs/speakers/7")
      return { ...ananya, talks: [{ event_id: 77, event_name: "DevFest 2026", date: "2026-10-04T10:00:00Z", talk_title: "Rovers", sessions: [] }], contact: server.contact };
    if (method === "PUT" && path === "/api/v1/clubs/speakers/7/contact") return { contact: { ...(body as object), consent_at: "2026-11-11T00:00:00Z" } };
    if (method === "POST" && path === "/api/v1/clubs/speakers/7/apply-to-upcoming") return { updated: 2, event_ids: [80, 81] };
    throw routeMissing();
  };
  return { ...actual, api: { get: record("GET"), post: record("POST"), put: record("PUT"), patch: record("PATCH"), del: record("DELETE") } };
});

const { render } = await import("@/test/render");
const { SpeakerPicker, ClubSpeakersPage, needsConsent, primaryLink } = await import("./index");

beforeEach(() => {
  calls.length = 0;
  server.old = false;
  server.contact = null;
});

describe("the picker", () => {
  it("offers the club's past speakers first, and hands back the one picked", async () => {
    const onPick = vi.fn();
    render(<SpeakerPicker open onOpenChange={vi.fn()} onPick={onPick} onNew={vi.fn()} />);
    const first = await screen.findByRole("button", { name: "Pick Ananya Iyer" });
    expect(first).toHaveTextContent("spoke at DevFest 2026");
    expect(screen.getByRole("button", { name: "Pick Rahul Nair" })).toHaveTextContent("has a public speaker profile");
    fireEvent.change(screen.getByLabelText("Find a speaker"), { target: { value: "anan" } });
    await waitFor(() => expect(calls.some((c) => c.path === "/api/v1/clubs/speakers" && c.query?.q === "anan")).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Pick Ananya Iyer" }));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ profile_id: 7, name: "Ananya Iyer", headline: "Head of Research · IIT-M" }));
  });

  it("leaves out the speakers already on the event", async () => {
    render(<SpeakerPicker open onOpenChange={vi.fn()} onPick={vi.fn()} onNew={vi.fn()} exclude={[7]} />);
    expect(await screen.findByRole("button", { name: "Pick Rahul Nair" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pick Ananya Iyer" })).toBeNull();
  });

  it("adds someone new with the name typed", async () => {
    const onNew = vi.fn();
    render(<SpeakerPicker open onOpenChange={vi.fn()} onPick={vi.fn()} onNew={onNew} />);
    fireEvent.change(await screen.findByLabelText("Find a speaker"), { target: { value: "Meera K" } });
    fireEvent.click(screen.getByRole("button", { name: /Add “Meera K” as someone new/ }));
    expect(onNew).toHaveBeenCalledWith("Meera K");
  });

  it("takes LinkedIn, then the site, as the event row's link, and never a script link", () => {
    expect(primaryLink({ website: "https://a.example", linkedin: "https://linkedin.com/in/a" })).toBe("https://linkedin.com/in/a");
    expect(primaryLink({ website: "https://a.example" })).toBe("https://a.example");
    expect(primaryLink({ other: "javascript:alert(1)" })).toBe("");
  });
});

describe("the consent rule", () => {
  it("asks for the tick only for an email or phone the club did not have", () => {
    expect(needsConsent(null, { email: "", phone: "" })).toBe(false);
    expect(needsConsent(null, { email: "a@x.in", phone: "" })).toBe(true);
    expect(needsConsent({ email: "a@x.in", phone: null }, { email: "A@x.in", phone: "" })).toBe(false);
    expect(needsConsent({ email: "a@x.in", phone: null }, { email: "a@x.in", phone: "98450 00000" })).toBe(true);
  });
});

describe("Club → Speakers", () => {
  it("lists the club's speakers with their last talk and the club's contact", async () => {
    render(<ClubSpeakersPage />);
    expect(await screen.findByText("Ananya Iyer")).toBeInTheDocument();
    expect(screen.getByText(/DevFest 2026/)).toBeInTheDocument();
    expect(screen.getByText("No contact")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Export to Excel/ })).toBeEnabled();
  });

  it("won't save a new email until the club ticks that the speaker agreed", async () => {
    render(<ClubSpeakersPage />);
    fireEvent.click(await screen.findByText("Ananya Iyer"));
    const sheet = await screen.findByRole("dialog");
    fireEvent.change(await within(sheet).findByLabelText("Email"), { target: { value: "ananya@iitm.ac.in" } });
    const save = within(sheet).getByRole("button", { name: "Save contact" });
    expect(save).toBeDisabled();
    fireEvent.click(within(sheet).getByRole("checkbox", { name: /speaker agreed/ }));
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() => expect(calls.find((c) => c.method === "PUT")?.body).toEqual({ email: "ananya@iitm.ac.in", phone: "", notes: "", consent: true }));
  });

  it("saves notes alone without asking", async () => {
    server.contact = { email: "ananya@iitm.ac.in", phone: null, notes: null, consent_at: "2026-10-01T00:00:00Z", consent_by: "Riya" };
    render(<ClubSpeakersPage />);
    fireEvent.click(await screen.findByText("Ananya Iyer"));
    const sheet = await screen.findByRole("dialog");
    fireEvent.change(await within(sheet).findByLabelText("Notes (only your club)"), { target: { value: "Needs HDMI" } });
    expect(within(sheet).queryByRole("checkbox", { name: /speaker agreed/ })).toBeNull();
    fireEvent.click(within(sheet).getByRole("button", { name: "Save contact" }));
    await waitFor(() => expect(calls.find((c) => c.method === "PUT")?.body).toMatchObject({ notes: "Needs HDMI", consent: true }));
  });

  it("copies the profile onto upcoming events", async () => {
    render(<ClubSpeakersPage />);
    fireEvent.click(await screen.findByText("Ananya Iyer"));
    fireEvent.click(await screen.findByRole("button", { name: /Apply to upcoming events/ }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.path === "/api/v1/clubs/speakers/7/apply-to-upcoming")).toBe(true));
  });

  it("says so quietly on an API without speakers", async () => {
    server.old = true;
    render(<ClubSpeakersPage />);
    expect(await screen.findByText("Speakers aren't available yet")).toBeInTheDocument();
  });
});
