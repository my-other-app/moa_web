import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

/**
 * The club's merchandise page, against the API contract (GET/POST/PATCH/
 * DELETE /clubs/store and POST /clubs/store/photo), with the client mocked.
 */
const calls: Array<{ method: string; path: string; body?: unknown }> = [];

const TEE = {
  id: "i1",
  name: "Hack Night tee",
  description: "Heavyweight cotton",
  photo_url: "https://cdn.example/tee.png",
  photo_key: "store/tee.png",
  price: 450,
  stock: null,
  variants: [
    { id: "v1", label: "S", stock: 30, sold: 8, held: 0, left: 22 },
    { id: "v2", label: "M", stock: 30, sold: 30, held: 0, left: 0 },
  ],
  available_roles: null,
  free_roles: ["speaker"],
  on_sale: true,
  sort_order: 0,
  sold: 38,
  held: 0,
  left: 22,
  earned: 17100,
  events: [
    { id: 37, name: "Hack Night 04", slug: "hack-night-04", event_datetime: "2026-11-01T18:00:00+05:30" },
    { id: 41, name: "Demo Day", slug: "demo-day", event_datetime: "2026-11-02T10:00:00+05:30" },
  ],
};
const LANYARD = { ...TEE, id: "i2", name: "Club lanyard", description: null, photo_url: null, photo_key: null, price: 80, stock: 100, variants: [], free_roles: [], available_roles: ["attendee", "staff"], on_sale: false, sold: 7, left: 93, earned: 560, events: [] };

const state = { items: [TEE, LANYARD] as unknown[] };

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        if (path === "/api/v1/clubs/store") return { items: state.items };
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "POST", path, body });
        if (path === "/api/v1/clubs/store/photo") return { key: "store/new.png", url: "https://cdn.example/new.png" };
        if (path === "/api/v1/clubs/store") return { ...LANYARD, id: "i9", name: "Hoodie", events: [] };
        throw new Error(`unstubbed POST ${path}`);
      }),
      patch: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "PATCH", path, body });
        return { ...TEE, ...(body as object) };
      }),
      put: vi.fn(),
      del: vi.fn(async (path: string) => {
        calls.push({ method: "DELETE", path });
        return { deleted: true };
      }),
    },
  };
});

const { render } = await import("@/test/render");
const { CataloguePage } = await import("./components/catalogue-page");
const { patchBody, createBody, catalogueFormSchema, formFromItem, clubStoreItemSchema } = await import("./schemas");

beforeEach(() => {
  calls.length = 0;
  state.items = [TEE, LANYARD];
});

const sheet = () => screen.findByRole("dialog");

describe("the club's merchandise", () => {
  it("lists every item with its photo, price, what is left per size, what it sold and earned, and the events offering it", async () => {
    render(<CataloguePage />);
    const list = await screen.findByRole("list", { name: "Your merchandise" });
    const cards = within(list).getAllByRole("listitem").filter((li) => li.parentElement === list);
    expect(cards).toHaveLength(2);
    const tee = cards[0]!;
    expect(within(tee).getByRole("heading", { name: "Hack Night tee" })).toBeInTheDocument();
    expect(within(tee).getByText("₹450")).toBeInTheDocument();
    expect(within(tee).getByText("Everyone · free for Speakers & mentors")).toBeInTheDocument();
    // Per size: S has 22 left, M none.
    const sizes = within(tee).getByRole("list", { name: "Hack Night tee left by size" });
    expect(within(sizes).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["S 22", "M 0"]);
    expect(within(tee).getByText("38")).toBeInTheDocument();
    expect(within(tee).getByText("₹17,100")).toBeInTheDocument();
    expect(within(tee).getByText("On 2 events")).toBeInTheDocument();
    expect(within(tee).getByRole("link", { name: "Hack Night 04" })).toHaveAttribute("href", "/events/37/store");
    expect(within(tee).getByRole("link", { name: "Demo Day" })).toHaveAttribute("href", "/events/41/store");
    expect(tee.querySelector("img")).toHaveAttribute("src", "https://cdn.example/tee.png");
    const lanyard = cards[1]!;
    expect(within(lanyard).getByText("93 left")).toBeInTheDocument();
    expect(within(lanyard).getByText("Hidden")).toBeInTheDocument();
    expect(within(lanyard).getByText("Not on an event yet")).toBeInTheDocument();
    // The figures across the catalogue.
    expect(screen.getByText("1 on sale")).toBeInTheDocument();
    expect(screen.getByText("₹17,660")).toBeInTheDocument();
  });

  it("says when there is nothing yet, and offers the first item", async () => {
    state.items = [];
    render(<CataloguePage />);
    expect(await screen.findByText("No merchandise yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Add item/ }));
    expect(await sheet()).toHaveTextContent("New item");
  });

  it("shows a placeholder while loading", () => {
    render(<CataloguePage />);
    expect(screen.getByLabelText("Loading your merchandise")).toHaveAttribute("aria-busy", "true");
  });

  it("creates an item with a photo, a description, sizes with their own stock, and who can buy it", async () => {
    render(<CataloguePage />);
    await screen.findByRole("heading", { name: "Hack Night tee" });
    fireEvent.click(screen.getByRole("button", { name: /Add item/ }));
    const dialog = await sheet();

    // A file it cannot take is refused before any upload.
    fireEvent.change(within(dialog).getByLabelText("Item photo"), { target: { files: [new File(["x"], "a.gif", { type: "image/gif" })] } });
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Use a PNG, JPEG or WebP image");
    const big = new File(["x"], "big.png", { type: "image/png" });
    Object.defineProperty(big, "size", { value: 6 * 1024 * 1024 });
    fireEvent.change(within(dialog).getByLabelText("Item photo"), { target: { files: [big] } });
    // Too big to send and, here, no canvas to redraw it smaller with: refused with words.
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("more than the 4.0 MB that can be sent");
    expect(calls.some((c) => c.path.endsWith("/photo"))).toBe(false);

    fireEvent.change(within(dialog).getByLabelText("Item photo"), { target: { files: [new File(["png"], "hoodie.png", { type: "image/png" })] } });
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.path === "/api/v1/clubs/store/photo")).toBe(true));
    const sent = calls.find((c) => c.path === "/api/v1/clubs/store/photo")!.body as FormData;
    expect((sent.get("file") as File).name).toBe("hoodie.png");
    // The preview shows straight away.
    expect(within(dialog).getByAltText("Photo preview")).toBeInTheDocument();
    expect(await within(dialog).findByText("Replace photo")).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Hoodie" } });
    fireEvent.change(within(dialog).getByLabelText("Description (optional)"), { target: { value: "Fleece, with the club crest" } });
    fireEvent.change(within(dialog).getByLabelText("Price (₹)"), { target: { value: "900" } });
    fireEvent.click(within(dialog).getByRole("switch", { name: "Comes in sizes" }));
    fireEvent.change(within(dialog).getByLabelText("Stock of size S"), { target: { value: "10" } });
    fireEvent.change(within(dialog).getByLabelText("Stock of size M"), { target: { value: "12" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove size L" }));
    fireEvent.click(within(within(dialog).getByRole("group", { name: "Who can buy it" })).getByRole("button", { name: "Attendees" }));
    fireEvent.click(within(within(dialog).getByRole("group", { name: "Who gets it free" })).getByRole("button", { name: "Speakers & mentors" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Add item" }));

    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.path === "/api/v1/clubs/store")).toBe(true));
    expect(calls.find((c) => c.method === "POST" && c.path === "/api/v1/clubs/store")!.body).toEqual({
      name: "Hoodie",
      description: "Fleece, with the club crest",
      photo_key: "store/new.png",
      price: 900,
      variants: [
        { label: "S", stock: 10 },
        { label: "M", stock: 12 },
      ],
      available_roles: ["attendee"],
      free_roles: ["speaker"],
      on_sale: true,
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("redraws a photo too big for the gateway smaller, and sends that", async () => {
    // jsdom has no canvas: one is stood in whose redraw weighs a byte per pixel.
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 4000, height: 3000, close: vi.fn() })));
    const ctx = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      () => ({ drawImage: vi.fn(), fillRect: vi.fn(), clearRect: vi.fn(), fillStyle: "" }) as unknown as CanvasRenderingContext2D,
    );
    const blob = vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (this: HTMLCanvasElement, done, type = "image/png") {
      const out = new Blob(["x"], { type });
      Object.defineProperty(out, "size", { value: this.width * this.height });
      done(out);
    });
    try {
      render(<CataloguePage />);
      await screen.findByRole("heading", { name: "Hack Night tee" });
      fireEvent.click(screen.getByRole("button", { name: /Add item/ }));
      const dialog = await sheet();
      const phone = new File(["x"], "IMG_2041.jpeg", { type: "image/jpeg" });
      Object.defineProperty(phone, "size", { value: 9 * 1024 * 1024 });
      fireEvent.change(within(dialog).getByLabelText("Item photo"), { target: { files: [phone] } });
      await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.path === "/api/v1/clubs/store/photo")).toBe(true));
      const sent = (calls.find((c) => c.path === "/api/v1/clubs/store/photo")!.body as FormData).get("file") as File;
      expect(sent.name).toBe("IMG_2041.jpg");
      expect(sent.size).toBeLessThanOrEqual(4 * 1024 * 1024);
      expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
    } finally {
      ctx.mockRestore();
      blob.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("says what is missing rather than sending a half-made item", async () => {
    render(<CataloguePage />);
    await screen.findByRole("heading", { name: "Hack Night tee" });
    fireEvent.click(screen.getByRole("button", { name: /Add item/ }));
    const dialog = await sheet();
    fireEvent.click(within(dialog).getByRole("button", { name: "Add item" }));
    expect(await within(dialog).findByText("Name the item")).toBeInTheDocument();
    expect(within(dialog).getByText("Enter the price")).toBeInTheDocument();
    expect(within(dialog).getByText("How many are there?")).toBeInTheDocument();
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("edits an item, sending only what changed", async () => {
    render(<CataloguePage />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit Hack Night tee" }));
    const dialog = await sheet();
    expect(within(dialog).getByText("Edit Hack Night tee")).toBeInTheDocument();
    expect(within(dialog).getByText(/Changes show on the 2 events offering it/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Name")).toHaveValue("Hack Night tee");
    expect(within(dialog).getByLabelText("Description (optional)")).toHaveValue("Heavyweight cotton");
    expect(within(dialog).getByRole("switch", { name: "Comes in sizes" })).toBeChecked();
    expect(within(dialog).getByLabelText("Stock of size M")).toHaveValue("30");
    // What a size has sold is said beside its stock, so it is not cut below it.
    expect(within(dialog).getByText("30 sold")).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText("Price (₹)"), { target: { value: "500" } });
    fireEvent.change(within(dialog).getByLabelText("Stock of size M"), { target: { value: "50" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true));
    expect(calls.find((c) => c.method === "PATCH")).toEqual({
      method: "PATCH",
      path: "/api/v1/clubs/store/i1",
      body: {
        price: 500,
        variants: [
          { label: "S", stock: 30 },
          { label: "M", stock: 50 },
        ],
      },
    });
  });

  it("asks before deleting, naming the events still offering the item", async () => {
    render(<CataloguePage />);
    fireEvent.click(await screen.findByRole("button", { name: "Delete Hack Night tee" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(within(confirm).getByText("Delete Hack Night tee?")).toBeInTheDocument();
    expect(confirm).toHaveTextContent("It is still offered on Hack Night 04 and Demo Day. Deleting it takes it off those 2 events too.");
    expect(within(within(confirm).getByRole("list", { name: "Events still offering it" })).getAllByRole("listitem").map((li) => li.textContent?.trim())).toEqual(["Hack Night 04", "Demo Day"]);
    // Keeping it sends nothing.
    fireEvent.click(within(confirm).getByRole("button", { name: "Keep it" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Delete Hack Night tee" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete item" }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE")).toBe(true));
    expect(calls.find((c) => c.method === "DELETE")!.path).toBe("/api/v1/clubs/store/i1");
  });

  it("says plainly when no event offers the item it would delete", async () => {
    render(<CataloguePage />);
    fireEvent.click(await screen.findByRole("button", { name: "Delete Club lanyard" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(confirm).toHaveTextContent("No event offers it.");
    expect(within(confirm).queryByRole("list")).not.toBeInTheDocument();
  });
});

describe("the item's wire format", () => {
  const item = clubStoreItemSchema.parse(LANYARD);
  const parse = (over: Record<string, unknown>) => catalogueFormSchema.parse({ ...formFromItem(item), photo_key: item.photo_key, ...over });

  it("sends one stock without sizes, and null roles for everyone", () => {
    expect(createBody(parse({ available_roles: [], stock: "40" }))).toMatchObject({ stock: 40, available_roles: null });
    expect(createBody(parse({ stock: "40" }))).not.toHaveProperty("variants");
  });

  it("takes the sizes away by sending none, with the one stock", () => {
    const tee = clubStoreItemSchema.parse(TEE);
    const form = catalogueFormSchema.parse({ ...formFromItem(tee), photo_key: tee.photo_key, sized: false, stock: "60" });
    expect(patchBody(tee, form)).toEqual({ variants: [], stock: 60 });
  });

  it("clears the description and the photo with null", () => {
    expect(patchBody(item, parse({ description: "", photo_key: null }))).toEqual({});
    const tee = clubStoreItemSchema.parse(TEE);
    expect(patchBody(tee, catalogueFormSchema.parse({ ...formFromItem(tee), photo_key: null, description: "" }))).toEqual({ description: null, photo_key: null });
  });

  it("refuses a fractional or negative stock and two sizes with one label", () => {
    expect(catalogueFormSchema.safeParse({ ...formFromItem(item), photo_key: null, stock: "2.5" }).success).toBe(false);
    expect(catalogueFormSchema.safeParse({ ...formFromItem(item), photo_key: null, stock: "-1" }).success).toBe(false);
    const dup = catalogueFormSchema.safeParse({ ...formFromItem(item), photo_key: null, sized: true, sizes: [{ label: "M", stock: "1" }, { label: "m", stock: "2" }] });
    expect(dup.success).toBe(false);
    expect(dup.error?.issues.map((i) => i.message)).toContain("Two sizes have the same label");
  });
});
