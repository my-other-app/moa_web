import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { ApiError } from "@moa/api";

import topicsFixture from "../__fixtures__/topics.json";
import legacyFixture from "../__fixtures__/interests-legacy.json";

/**
 * The topic picker and the rules behind it, against GET /interests/list as
 * the topics release answers it (topics with slug, colour, order, their
 * interests beneath) and as production answers it today (one category,
 * "arts", holding everything, none of the new fields).
 */
const state: { list: unknown } = { list: topicsFixture };
const gets: string[] = [];

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        gets.push(path);
        if (path === "/api/v1/interests/list") {
          if (state.list instanceof Error) throw state.list;
          return state.list;
        }
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { TopicPicker, fetchTopicTree, useResolvedTopics } = await import("./index");
const { parseTopicTree, isTopicAware, resolveTopics, filterTopicTree, topicLabel, topicsForInterests, topicColor, TopicChips } = await import("@moa/app-kit");

beforeEach(() => {
  state.list = topicsFixture;
  gets.length = 0;
});

function Controlled({ initial = [], onChange, ...rest }: { initial?: number[]; onChange?: (v: number[]) => void } & Partial<React.ComponentProps<typeof TopicPicker>>) {
  const [value, setValue] = React.useState<number[]>(initial);
  return (
    <TopicPicker
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
      {...rest}
    />
  );
}

const tree = () => parseTopicTree(topicsFixture);
const legacy = () => parseTopicTree(legacyFixture);

describe("reading /interests/list", () => {
  it("reads the topics release's shape, new fields and all", async () => {
    const topics = await fetchTopicTree();
    expect(topics.map((t) => t.slug)).toEqual(["development", "deep-tech", "arts", "community"]);
    expect(topics[0]).toMatchObject({ name: "Development", color: "#2563EB", sort_order: 1 });
    expect(topics[0]!.interests[0]).toMatchObject({ id: 3, slug: "web-development", category_id: 2 });
    // A topic with nothing under it yet is still listed.
    expect(topics[3]!.interests).toEqual([]);
  });

  it("reads today's shape, one category without the new fields", () => {
    const topics = legacy();
    expect(topics).toHaveLength(1);
    expect(topics[0]).toMatchObject({ id: 1, name: "arts" });
    expect(topics[0]!.slug).toBeUndefined();
    expect(isTopicAware(topics)).toBe(false);
    expect(isTopicAware(tree())).toBe(true);
  });

  it("copes with a bare list of interests, or either inside { items }", () => {
    const flat = parseTopicTree([{ id: 6, name: "Coding" }, { id: 7, name: "UI/UX" }]);
    expect(flat).toHaveLength(1);
    expect(flat[0]!.interests.map((i) => i.name)).toEqual(["Coding", "UI/UX"]);
    expect(parseTopicTree({ items: topicsFixture }).map((t) => t.name)).toEqual(["Development", "Deep Tech", "Arts", "Community"]);
    expect(parseTopicTree([])).toEqual([]);
  });
});

describe("which topics an event or a club shows", () => {
  it("takes the server's own topics when it sends them, even none", () => {
    const own = [{ id: 3, slug: "deep-tech", name: "Deep Tech", color: "#7C3AED" }];
    expect(resolveTopics({ topics: own, interests: [{ id: 6 }] }, tree())).toEqual(own);
    expect(resolveTopics({ topics: [], interests: [{ id: 6 }] }, tree())).toEqual([]);
  });

  it("derives them from the interests' category_id, then from the tree, in topic order", () => {
    // 21 says it is under Arts; 31 is placed by the tree under Deep Tech; 6 under Development.
    const topics = resolveTopics({ topics: null, interests: [{ id: 21, category_id: 1 }, { id: 31 }, { id: 6 }] }, tree());
    expect(topics.map((t) => t.name)).toEqual(["Development", "Deep Tech", "Arts"]);
    expect(topics[0]).toEqual({ id: 2, name: "Development", slug: "development", color: "#2563EB" });
    // An interest the tree does not know is skipped.
    expect(topicsForInterests([999], tree())).toEqual([]);
  });

  it("shows none against today's list rather than calling everything arts", () => {
    expect(resolveTopics({ interests: [{ id: 3 }, { id: 21 }] }, legacy())).toEqual([]);
    expect(resolveTopics({ interests: [] }, tree())).toEqual([]);
    expect(resolveTopics({ interests: [{ id: 3 }] }, undefined)).toEqual([]);
  });

  it("reads the old lowercase name as a title, and falls back to the brand colour", () => {
    expect(topicLabel("arts")).toBe("Arts");
    expect(topicLabel("Deep Tech")).toBe("Deep Tech");
    expect(topicLabel("iOS")).toBe("iOS");
    expect(topicColor({ color: "#2563EB" })).toBe("#2563EB");
    expect(topicColor({ color: "blue; background: url(x)" })).toBe("var(--brand)");
    expect(topicColor({})).toBe("var(--brand)");
  });

  it("asks for the tree only when the payload has interests and no topics", async () => {
    function Probe({ entity }: { entity: Parameters<typeof useResolvedTopics>[0] }) {
      const topics = useResolvedTopics(entity);
      return <TopicChips topics={topics} />;
    }
    const { unmount } = render(<Probe entity={{ topics: [{ id: 3, name: "Deep Tech", color: "#7C3AED" }], interests: [{ id: 6 }] }} />);
    expect(within(screen.getByRole("list", { name: "Topics" })).getByText("Deep Tech")).toBeInTheDocument();
    expect(gets).toEqual([]);
    unmount();

    render(<Probe entity={{ topics: null, interests: [{ id: 6 }, { id: 22 }] }} />);
    const list = await screen.findByRole("list", { name: "Topics" });
    expect(within(list).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Development", "Arts"]);
    expect(gets).toEqual(["/api/v1/interests/list"]);
  });
});

describe("searching", () => {
  it("keeps a whole topic when its name matches, else only the matching interests", () => {
    expect(filterTopicTree(tree(), "deep").map((t) => [t.name, t.interests.length])).toEqual([["Deep Tech", 2]]);
    expect(filterTopicTree(tree(), "dev").map((t) => [t.name, t.interests.map((i) => i.name)])).toEqual([
      ["Development", ["Web Development", "App Development", "Coding", "Cybersecurity"]],
    ]);
    expect(filterTopicTree(tree(), "  ROBOT ").map((t) => t.interests.map((i) => i.name))).toEqual([["Robotics"]]);
  });

  it("ignores accents and matches a slug's words", () => {
    expect(filterTopicTree(tree(), "theatre").flatMap((t) => t.interests.map((i) => i.name))).toEqual(["Théâtre"]);
    expect(filterTopicTree(tree(), "artificial intel").flatMap((t) => t.interests.map((i) => i.name))).toEqual(["Artificial Intelligence"]);
    expect(filterTopicTree(tree(), "")).toHaveLength(4);
  });
});

describe("the picker", () => {
  it("groups the interests under each topic, as named groups of checkboxes", async () => {
    render(<Controlled />);
    const dev = await screen.findByRole("group", { name: /Development/ });
    expect(within(dev).getAllByRole("checkbox").map((c) => c.closest("label")!.textContent)).toEqual(["Web Development", "App Development", "⌨️Coding", "Cybersecurity"]);
    const deep = screen.getByRole("group", { name: /Deep Tech/ });
    expect(within(deep).getByRole("checkbox", { name: "Robotics" })).not.toBeChecked();
    expect(screen.getByRole("group", { name: /Arts/ })).toBeInTheDocument();
    // The topic's description, and a topic with nothing in it yet.
    expect(screen.getByText("Building software, from the web to the cloud.")).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: /Community/ })).getByText("Nothing under this topic yet.")).toBeInTheDocument();
    // The whole picker is one named group, its count read out as it changes.
    const picker = screen.getByRole("group", { name: "Interests" });
    expect(screen.getByText("None picked")).toHaveAttribute("aria-live", "polite");
    expect(picker.getAttribute("aria-describedby")).toContain(screen.getByText("None picked").id);
  });

  it("picks and unpicks, keeping the order they were picked in", async () => {
    const changes: number[][] = [];
    render(<Controlled onChange={(v) => changes.push(v)} />);
    fireEvent.click(await screen.findByRole("checkbox", { name: "Robotics" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Coding/ }));
    expect(screen.getByRole("checkbox", { name: "Robotics" })).toBeChecked();
    expect(screen.getByText("2 interests picked")).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: /Deep Tech/ })).getByText("1 picked")).toBeInTheDocument();

    const picked = screen.getByRole("list", { name: "Picked interests" });
    expect(within(picked).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Robotics", "Coding"]);
    // What the picks put the club or event under.
    const under = screen.getByRole("list", { name: "Shows under these topics" });
    expect(within(under).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Development", "Deep Tech"]);

    fireEvent.click(screen.getByRole("checkbox", { name: "Robotics" }));
    expect(changes).toEqual([[31], [31, 6], [6]]);
    expect(screen.getByText("1 interest picked")).toBeInTheDocument();
  });

  it("removes a pick from the chips above, and moves focus to the next one", async () => {
    render(<Controlled initial={[3, 22, 31]} />);
    const remove = await screen.findByRole("button", { name: "Remove Music" });
    remove.focus();
    fireEvent.click(remove);
    expect(screen.getByRole("checkbox", { name: "Music" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Remove Robotics" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Remove Robotics" }));
    expect(screen.getByRole("button", { name: "Remove Web Development" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Remove Web Development" }));
    // Nothing left to focus among the chips: the search takes it.
    expect(screen.getByRole("searchbox", { name: "Search interests" })).toHaveFocus();
    expect(screen.queryByRole("list", { name: "Picked interests" })).not.toBeInTheDocument();
  });

  it("searches across every topic, says when nothing matches, and Escape clears it", async () => {
    render(<Controlled initial={[22]} />);
    const search = await screen.findByRole("searchbox", { name: "Search interests" });
    fireEvent.change(search, { target: { value: "ro" } });
    // Robotics (Deep Tech); App Development and Web Development do not contain "ro"... Photography does not either.
    expect(screen.getAllByRole("checkbox").map((c) => c.closest("label")!.textContent)).toEqual(["Robotics"]);
    expect(screen.queryByRole("group", { name: /Development/ })).not.toBeInTheDocument();
    // What is picked stays in view while the list is narrowed.
    expect(within(screen.getByRole("list", { name: "Picked interests" })).getByText("Music")).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "arts" } });
    expect(screen.getAllByRole("checkbox").map((c) => c.closest("label")!.textContent)).toEqual(["🥁Music", "📷Photography", "Théâtre"]);

    fireEvent.change(search, { target: { value: "knitting" } });
    expect(screen.getByText(/Nothing matches “knitting”/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear the search" }));
    expect(screen.getAllByRole("checkbox")).toHaveLength(9);

    fireEvent.change(search, { target: { value: "coding" } });
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    fireEvent.keyDown(search, { key: "Escape" });
    expect(search).toHaveValue("");
    expect(screen.getAllByRole("checkbox")).toHaveLength(9);
  });

  it("holds to a maximum: the rest are disabled until one is removed", async () => {
    render(<Controlled initial={[3, 6]} max={2} />);
    expect(await screen.findByText("2 of 2 picked")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Robotics" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: /Coding/ })).toBeEnabled();
    expect(screen.getByText(/That's the most you can pick \(2\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /Coding/ }));
    expect(screen.getByRole("checkbox", { name: "Robotics" })).toBeEnabled();
  });

  it("says a minimum until it is met", async () => {
    render(<Controlled min={1} />);
    expect(await screen.findByText("Pick at least 1.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Music" }));
    expect(screen.queryByText("Pick at least 1.")).not.toBeInTheDocument();
  });

  it("is one section against today's API, with no topics to show under", async () => {
    state.list = legacyFixture;
    render(<Controlled initial={[6]} />);
    const groups = await screen.findAllByRole("group", { name: /Arts/ });
    expect(groups).toHaveLength(1);
    expect(within(groups[0]!).getAllByRole("checkbox")).toHaveLength(5);
    expect(screen.getByRole("checkbox", { name: /Coding/ })).toBeChecked();
    // The seeded placeholder icon is not printed on the chip.
    expect(screen.getByRole("checkbox", { name: "Web Development" }).closest("label")!.textContent).toBe("Web Development");
    expect(screen.getByRole("searchbox", { name: "Search interests" })).toHaveAttribute("placeholder", "Search interests");
    expect(screen.queryByRole("list", { name: "Shows under these topics" })).not.toBeInTheDocument();
  });

  it("keeps an id the list no longer has, without showing it", async () => {
    const changes: number[][] = [];
    render(<Controlled initial={[404, 6]} onChange={(v) => changes.push(v)} />);
    expect(await screen.findByText("1 interest picked")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Robotics" }));
    expect(changes).toEqual([[404, 6, 31]]);
  });

  it("does nothing while disabled", async () => {
    const onChange = vi.fn();
    render(<TopicPicker value={[6]} onChange={onChange} disabled />);
    const box = await screen.findByRole("checkbox", { name: "Robotics" });
    expect(box).toBeDisabled();
    fireEvent.click(box);
    expect(screen.getByRole("button", { name: "Remove Coding" })).toBeDisabled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("says what the form does when the list cannot load", async () => {
    state.list = new ApiError({ status: 503, message: "Unavailable" });
    render(<Controlled errorText="Left as they are when you save." />);
    expect(await screen.findByText("Left as they are when you save.")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("shows a skeleton while loading", async () => {
    let release: (v: unknown) => void = () => {};
    state.list = new Promise((r) => (release = r));
    render(<Controlled />);
    expect(screen.getByRole("group", { name: "Interests" })).toHaveAttribute("aria-busy", "true");
    await act(async () => release(topicsFixture));
    expect(await screen.findByRole("checkbox", { name: "Robotics" })).toBeInTheDocument();
  });
});
