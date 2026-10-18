import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@moa/api";

import topicsFixture from "../__fixtures__/topics.json";
import statsFixture from "../__fixtures__/topic-stats.json";
import legacyFixture from "../__fixtures__/interests-legacy.json";

/**
 * The Topics page against the topics contract (2026-10-18):
 *   GET    /interests/list, GET /interests/topics
 *   POST   /interests/category/create, PUT /interests/category/{id}
 *   DELETE /interests/category/{id}?move_to=   409 TOPIC_NOT_EMPTY without it when it has interests
 *   POST   /interests/reorder { topics?, interests?: { "<topic id>": [ids] } }
 *   POST   /interests/create, PUT /interests/{id}, DELETE /interests/{id}
 * and against production before that release, where /interests/topics is a
 * 405, the category routes are 404s and the list is one category, "arts".
 */
type Topic = (typeof topicsFixture)[number];

let role: string | null = "owner";
const state: { list: unknown; stats: unknown } = { list: null, stats: null };
const calls: Array<{ method: string; path: string; body?: unknown; query?: Record<string, unknown> }> = [];
/** The next answer to METHOD path, when it is a refusal. */
const refusals = new Map<string, ApiError>();

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const notAllowed = () => new ApiError({ status: 405, message: "Method Not Allowed" });
const notFound = () => new ApiError({ status: 404, message: "Not Found" });

function refuse(method: string, path: string) {
  const key = `${method} ${path}`;
  const error = refusals.get(key);
  if (error) {
    refusals.delete(key);
    throw error;
  }
}

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    useSession: () => ({ data: { id: 1, username: "admin", email: "a@b.c", full_name: "Admin", user_type: "admin", admin_role: role } }),
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        const answer = path === "/api/v1/interests/list" ? state.list : path === "/api/v1/interests/topics" ? state.stats : undefined;
        if (answer === undefined) throw new Error(`unstubbed GET ${path}`);
        if (answer instanceof Error) throw answer;
        return clone(answer);
      }),
      post: vi.fn(async (path: string, body?: unknown) => {
        calls.push({ method: "POST", path, body });
        refuse("POST", path);
        // The server keeps the order it was given, so the list read back after says the same.
        if (path === "/api/v1/interests/reorder" && Array.isArray(state.list)) {
          const b = body as { topics?: number[]; interests?: Record<string, number[]> };
          type Loose = { id: number; interests: Array<{ id: number }> };
          let list = state.list as Loose[];
          if (b.topics) list = b.topics.map((id) => list.find((t) => t.id === id)!);
          for (const [tid, ids] of Object.entries(b.interests ?? {})) {
            list = list.map((t) => (t.id === Number(tid) ? { ...t, interests: ids.map((id) => t.interests.find((i) => i.id === id)!) } : t));
          }
          state.list = list;
        }
        return {};
      }),
      put: vi.fn(async (path: string, body?: unknown) => {
        calls.push({ method: "PUT", path, body });
        refuse("PUT", path);
        return {};
      }),
      patch: vi.fn(),
      del: vi.fn(async (path: string, _body?: unknown, init?: { query?: Record<string, unknown> }) => {
        calls.push({ method: "DELETE", path, query: init?.query });
        refuse("DELETE", path);
        return { detached_from: 2 };
      }),
    },
  };
});

const { render } = await import("@/test/render");
const { toast } = await import("@moa/ui");
const { TopicsManager, slugify, isMissingEndpoint, isTopicNotEmpty, reorderTopic, reorderInterest, topicFormSchema } = await import("./index");
const { parseTopicTree } = await import("@moa/app-kit");

beforeEach(() => {
  role = "owner";
  state.list = topicsFixture;
  state.stats = statsFixture;
  calls.length = 0;
  refusals.clear();
  vi.restoreAllMocks();
});

const writes = () => calls.filter((c) => c.method !== "GET");
const rowOf = (name: string) => screen.getByRole("button", { name }).closest("li")!;
const topicOrder = () => within(screen.getByRole("list", { name: "Topics, in order" })).getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
async function ready() {
  await screen.findByRole("list", { name: "Topics, in order" });
}
async function expand(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
  return screen.findByRole("list", { name: `Interests in ${name}` });
}

describe("the rules", () => {
  it("makes an address from a name the way the seeded ones were", () => {
    expect(slugify("Gaming & Media")).toBe("gaming-media");
    expect(slugify("  Deep Tech ")).toBe("deep-tech");
    expect(slugify("Théâtre")).toBe("theatre");
    expect(topicFormSchema.safeParse({ name: "Deep Tech", slug: "Deep Tech" }).success).toBe(false);
    expect(topicFormSchema.safeParse({ name: "Deep Tech", slug: "deep-tech", color: "#7C3AED" }).success).toBe(true);
    expect(topicFormSchema.safeParse({ name: "Deep Tech", color: "purple" }).success).toBe(false);
  });

  it("tells a missing endpoint from a refusal", () => {
    expect(isMissingEndpoint(notAllowed())).toBe(true);
    expect(isMissingEndpoint(notFound())).toBe(true);
    expect(isMissingEndpoint(new ApiError({ status: 404, message: "Topic not found", errorCode: "TOPIC_NOT_FOUND" }))).toBe(false);
    expect(isMissingEndpoint(new ApiError({ status: 409, message: "Not empty", errorCode: "TOPIC_NOT_EMPTY" }))).toBe(false);
    expect(isTopicNotEmpty(new ApiError({ status: 409, message: "Not empty", errorCode: "TOPIC_NOT_EMPTY" }))).toBe(true);
  });

  it("says a reorder as the contract's body", () => {
    const tree = parseTopicTree(topicsFixture);
    expect(reorderTopic(tree, 3, -1).body).toEqual({ topics: [3, 2, 5, 9] });
    expect(reorderTopic(tree, 2, -1).body).toEqual({ topics: [2, 3, 5, 9] });
    expect(reorderInterest(tree, 2, 6, 1).body).toEqual({ interests: { "2": [3, 12, 6] } });
  });
});

describe("the Topics page", () => {
  it("lists the topics in order with their counts, each opening onto its interests", async () => {
    render(<TopicsManager />);
    await ready();
    expect(topicOrder()).toEqual(["Development", "Deep Tech", "Design", "Community"]);
    expect(screen.getByText("4 topics · 6 interests")).toBeInTheDocument();
    const dev = rowOf("Development");
    expect(within(dev).getByText("development")).toBeInTheDocument();
    expect(await within(dev).findByText("3 interests · 30 clubs · 12 upcoming events")).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Development" })).toHaveAttribute("aria-expanded", "false");
    const interests = await expand("Development");
    expect(screen.getByRole("button", { name: "Development" })).toHaveAttribute("aria-expanded", "true");
    expect(within(interests).getAllByRole("listitem").map((li) => li.textContent?.replace(/\s+/g, " "))).toEqual([
      "Web Developmentweb-development· 4 upcoming events",
      "⌨️Codingcoding· 1 upcoming event",
      "Cybersecuritycybersecurity· 0 upcoming events",
    ]);
    expect(screen.getByText("Building software, from the web to the cloud.")).toBeInTheDocument();
    expect(screen.queryByText(/backend/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
    expect(screen.getByRole("list", { name: "Interests in Deep Tech" })).toBeInTheDocument();
    expect(within(rowOf("Community")).getByText(/Nothing under this topic yet/)).toBeInTheDocument();
  });

  it("creates a topic with its address, colour and description", async () => {
    render(<TopicsManager />);
    await ready();
    fireEvent.click(screen.getByRole("button", { name: /New topic/ }));
    const dialog = await screen.findByRole("dialog", { name: "New topic" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add topic" }));
    expect(await within(dialog).findByText("Give it a name of at least 2 characters")).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Gaming & Media" } });
    expect(within(dialog).getByLabelText("Address")).toHaveAttribute("placeholder", "gaming-media");
    fireEvent.change(within(dialog).getByLabelText("Address"), { target: { value: "games and media" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add topic" }));
    expect(await within(dialog).findByText(/Lowercase letters, numbers and single dashes/)).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Address"), { target: { value: "" } });

    fireEvent.change(within(dialog).getByLabelText("Emoji"), { target: { value: "🎮" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Colour #DC2626" }));
    expect(within(dialog).getByRole("button", { name: "Colour #DC2626" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.change(within(dialog).getByLabelText("Description (optional)"), { target: { value: "Games, e-sports and the internet." } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add topic" }));

    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({
      method: "POST",
      path: "/api/v1/interests/category/create",
      body: { name: "Gaming & Media", icon: "🎮", icon_type: "emoji", color: "#DC2626", description: "Games, e-sports and the internet." },
    });
    // Left empty, the address is the server's to make.
    expect((writes()[0]!.body as Record<string, unknown>).slug).toBeUndefined();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("edits a topic's name, address, emoji, colour and description", async () => {
    render(<TopicsManager />);
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Edit Deep Tech" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit Deep Tech" });
    expect(within(dialog).getByLabelText("Address")).toHaveValue("deep-tech");
    expect(within(dialog).getByLabelText("Colour as hex")).toHaveValue("#7C3AED");
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Frontier Tech" } });
    fireEvent.change(within(dialog).getByLabelText("Address"), { target: { value: "frontier-tech" } });
    fireEvent.change(within(dialog).getByLabelText("Description (optional)"), { target: { value: "What comes next." } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save topic" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual({
      method: "PUT",
      path: "/api/v1/interests/category/3",
      body: { name: "Frontier Tech", slug: "frontier-tech", icon: "🧠", icon_type: "emoji", color: "#7C3AED", description: "What comes next." },
    });
  });

  it("shows the server's refusal in the dialog and changes nothing", async () => {
    refusals.set("PUT /api/v1/interests/category/3", new ApiError({ status: 409, message: "That address is taken.", errorCode: "SLUG_TAKEN" }));
    render(<TopicsManager />);
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Edit Deep Tech" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit Deep Tech" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save topic" }));
    expect(await within(dialog).findByText("That address is taken. Nothing was changed.")).toBeInTheDocument();
  });

  it("deletes a topic with interests by moving them first, and an empty one outright", async () => {
    render(<TopicsManager />);
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Delete Deep Tech" }));
    let dialog = await screen.findByRole("dialog", { name: "Delete Deep Tech?" });
    expect(within(dialog).getByText(/Its 2 interests move to another topic first/)).toBeInTheDocument();
    const moveTo = within(dialog).getByLabelText("Move its 2 interests to");
    expect(within(moveTo).getAllByRole("option").map((o) => o.textContent)).toEqual(["Development", "Design", "Community"]);
    fireEvent.change(moveTo, { target: { value: "5" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Move to Design and delete" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual({ method: "DELETE", path: "/api/v1/interests/category/3", query: { move_to: 5 } });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    calls.length = 0;
    fireEvent.click(screen.getByRole("button", { name: "Delete Community" }));
    dialog = await screen.findByRole("dialog", { name: "Delete Community?" });
    expect(within(dialog).getByText(/Nothing is under it/)).toBeInTheDocument();
    expect(within(dialog).queryByRole("combobox")).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete topic" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual({ method: "DELETE", path: "/api/v1/interests/category/9", query: undefined });
  });

  it("explains TOPIC_NOT_EMPTY: interests were added meanwhile, so it asks where they go", async () => {
    render(<TopicsManager />);
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Delete Community" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete Community?" });
    // Someone added Volunteering to Community after this page loaded.
    refusals.set("DELETE /api/v1/interests/category/9", new ApiError({ status: 409, message: "Topic still has interests", errorCode: "TOPIC_NOT_EMPTY" }));
    state.list = (topicsFixture as Topic[]).map((t) => (t.id === 9 ? { ...t, interests: [{ id: 40, slug: "volunteering", name: "Volunteering", icon: null, icon_type: null, category_id: 9, sort_order: 1 }] } : t));
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete topic" }));

    expect(await within(dialog).findByText(/has interests now that it did not have when this page loaded/)).toBeInTheDocument();
    const moveTo = await within(dialog).findByLabelText("Move its 1 interest to");
    fireEvent.change(moveTo, { target: { value: "2" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Move to Development and delete" }));
    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(writes()[1]).toEqual({ method: "DELETE", path: "/api/v1/interests/category/9", query: { move_to: 2 } });
  });

  it("moves topics and interests up and down, saying the new order", async () => {
    render(<TopicsManager />);
    await ready();
    expect(screen.getByRole("button", { name: "Move Development up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Community down" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Move Deep Tech up" }));
    await waitFor(() => expect(topicOrder()).toEqual(["Deep Tech", "Development", "Design", "Community"]));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual({ method: "POST", path: "/api/v1/interests/reorder", body: { topics: [3, 2, 5, 9] } });

    const interests = await expand("Development");
    await waitFor(() => expect(screen.getByRole("button", { name: "Move Coding down" })).toBeEnabled());
    fireEvent.click(within(interests).getByRole("button", { name: "Move Coding down" }));
    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(writes()[1]).toEqual({ method: "POST", path: "/api/v1/interests/reorder", body: { interests: { "2": [3, 12, 6] } } });
    await waitFor(() =>
      expect(within(screen.getByRole("list", { name: "Interests in Development" })).getAllByRole("listitem").map((li) => li.querySelector(".font-medium")?.textContent)).toEqual([
        "Web Development",
        "Cybersecurity",
        "Coding",
      ]),
    );
  });

  it("moves an interest to another topic, keeping its name and emoji", async () => {
    render(<TopicsManager />);
    await ready();
    await expand("Development");
    fireEvent.click(screen.getByRole("button", { name: "Move Coding to another topic" }));
    const dialog = await screen.findByRole("dialog", { name: "Move Coding" });
    const to = within(dialog).getByLabelText("Move to");
    expect(within(to).getAllByRole("option").map((o) => o.textContent)).toEqual(["Deep Tech", "Design", "Community"]);
    fireEvent.change(to, { target: { value: "3" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Move" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual({ method: "PUT", path: "/api/v1/interests/6", body: { name: "Coding", category_id: 3, icon: "⌨️", icon_type: "emoji", slug: "coding" } });
  });

  it("adds an interest to a topic, and edits one's name, address and topic", async () => {
    render(<TopicsManager />);
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Add an interest to Design" }));
    let dialog = await screen.findByRole("dialog", { name: "New interest" });
    expect(within(dialog).getByLabelText("Topic")).toHaveValue("5");
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Graphic Design" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add interest" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({ method: "POST", path: "/api/v1/interests/create", body: { name: "Graphic Design", category_id: 5, icon: null, icon_type: null } });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await expand("Deep Tech");
    fireEvent.click(screen.getByRole("button", { name: "Edit Robotics" }));
    dialog = await screen.findByRole("dialog", { name: "Edit Robotics" });
    expect(within(dialog).getByLabelText("Address")).toHaveValue("robotics");
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Robotics & Drones" } });
    fireEvent.change(within(dialog).getByLabelText("Address"), { target: { value: "robotics-drones" } });
    fireEvent.change(within(dialog).getByLabelText("Topic"), { target: { value: "2" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save interest" }));
    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(writes()[1]).toEqual({ method: "PUT", path: "/api/v1/interests/31", body: { name: "Robotics & Drones", category_id: 2, icon: null, icon_type: null, slug: "robotics-drones" } });
  });

  it("deletes an interest after saying what it detaches", async () => {
    render(<TopicsManager />);
    await ready();
    await expand("Design");
    fireEvent.click(screen.getByRole("button", { name: "Delete UI/UX" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Delete “UI/UX”?" });
    expect(within(dialog).getByText(/removed from every club, event and person that picked it/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete interest" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual({ method: "DELETE", path: "/api/v1/interests/7", query: undefined });
  });

  it("shows the tree and nothing to change it to a viewer", async () => {
    role = "viewer";
    render(<TopicsManager />);
    await ready();
    await expand("Development");
    expect(screen.queryByRole("button", { name: /New topic/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit Development" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete Coding" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Move Coding up" })).not.toBeInTheDocument();
  });
});

describe("before the backend's topics update", () => {
  beforeEach(() => {
    state.list = legacyFixture;
    state.stats = notAllowed();
  });

  it("says calmly what waits for the update, and holds back only that", async () => {
    render(<TopicsManager />);
    await ready();
    const notice = await screen.findByRole("note");
    expect(notice).toHaveTextContent(/arrive with the backend's topics update, which is not live yet/);
    expect(notice).toHaveTextContent(/adding, editing, moving and deleting interests, work now/);
    // The one topic there is, open; the old lowercase name read as a title; no counts to show.
    expect(topicOrder()).toEqual(["Arts"]);
    expect(screen.getByRole("button", { name: "Arts" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("3 interests")).toBeInTheDocument();
    expect(screen.queryByText(/upcoming/)).not.toBeInTheDocument();
    for (const name of ["Edit Arts", "Delete Arts", "Move Coding up", "Move Coding down", "Move Coding to another topic"]) {
      expect(screen.getByRole("button", { name })).toBeDisabled();
    }
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("still adds, edits and deletes interests", async () => {
    render(<TopicsManager />);
    await ready();
    fireEvent.click(screen.getByRole("button", { name: /New interest/ }));
    let dialog = await screen.findByRole("dialog", { name: "New interest" });
    // No address to ask for: today's server would drop it.
    expect(within(dialog).queryByLabelText("Address")).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Robotics" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add interest" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({ method: "POST", path: "/api/v1/interests/create", body: { name: "Robotics", category_id: 1 } });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Edit Web Development" }));
    dialog = await screen.findByRole("dialog", { name: "Edit Web Development" });
    // The seeded "string" icon is not offered back as an emoji.
    expect(within(dialog).getByLabelText("Emoji")).toHaveValue("");
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Web Dev" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save interest" }));
    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(writes()[1]).toMatchObject({ method: "PUT", path: "/api/v1/interests/3", body: { name: "Web Dev", category_id: 1, icon: null, icon_type: null } });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Delete Photography" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete interest" }));
    await waitFor(() => expect(writes()).toHaveLength(3));
    expect(writes()[2]).toMatchObject({ method: "DELETE", path: "/api/v1/interests/21" });
  });

  it("adds a topic with the name and emoji today's server reads", async () => {
    render(<TopicsManager />);
    await ready();
    fireEvent.click(screen.getByRole("button", { name: /New topic/ }));
    const dialog = await screen.findByRole("dialog", { name: "New topic" });
    expect(within(dialog).getByText(/address, colour and description arrive with the backend update/)).toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Address")).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Development" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add topic" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual({ method: "POST", path: "/api/v1/interests/category/create", body: { name: "Development", icon: null, icon_type: null } });
  });

  it("turns a 404 or 405 from a new endpoint into the notice, and puts the rows back", async () => {
    // The list reads as the new release's, but the reorder route is not there.
    state.list = topicsFixture;
    refusals.set("POST /api/v1/interests/reorder", notFound());
    const error = vi.spyOn(toast, "error");
    render(<TopicsManager />);
    await ready();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Move Deep Tech up" }));
    expect(await screen.findByRole("note")).toHaveTextContent(/backend's topics update/);
    expect(topicOrder()).toEqual(["Development", "Deep Tech", "Design", "Community"]);
    expect(screen.getByRole("button", { name: "Edit Development" })).toBeDisabled();
    expect(error).not.toHaveBeenCalled();
  });
});
