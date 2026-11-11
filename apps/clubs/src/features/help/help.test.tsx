import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@moa/api";

/**
 * Help in the club dashboard: in the rail only once the API has the desk,
 * the form that warns about passwords and carries the page the club came
 * from and the club, its screenshots checked and uploaded first, and a
 * request's thread with a reply and "Did we solve it?".
 */
const calls: { method: string; path: string; body?: unknown }[] = [];
const server = vi.hoisted(() => ({ old: false, unread: false }));

const routeMissing = () => new ApiError({ status: 404, message: "Not Found", routeMissing: true });

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  const record = (method: string) => async (path: string, body?: unknown) => {
    calls.push({ method, path, body });
    if (method === "GET" && path === "/api/v1/support/help") {
      if (server.old) throw routeMissing();
      return [
        { id: 1, topic: "tickets", question: "Where is my ticket email?", answer: "It comes from tickets@ within a minute." },
        { id: 2, topic: null, question: "Can I change my club's name?", answer: "Yes, from Club profile." },
      ];
    }
    if (method === "GET" && path === "/api/v1/support/topics") return [{ key: "tickets", label: "Tickets and registration" }, { key: "dashboard", label: "Club dashboard" }];
    if (method === "GET" && path === "/api/v1/support/requests") return [{ id: 8, number: 1042, subject: "Emails not arriving", topic: "tickets", status: "waiting", updated_at: "2026-11-11T09:00:00Z", unread: server.unread }];
    if (method === "POST" && path === "/api/v1/support/uploads") {
      const files = (body as FormData).getAll("files") as File[];
      return { key: "k0", name: files[0]?.name, size: 1, files: files.map((f, i) => ({ key: `k${i}`, name: f.name, size: f.size })) };
    }
    if (method === "POST" && path === "/api/v1/support/requests") return { id: 8, number: 1042, status: "new" };
    if (method === "GET" && path === "/api/v1/support/requests/8")
      return {
        id: 8,
        number: 1042,
        subject: "Emails not arriving",
        status: "resolved",
        created_at: "2026-11-10T09:00:00Z",
        messages: [
          { id: 1, kind: "reply_in", body_text: "Our attendees get no ticket emails.", author_name: "Circuit", created_at: "2026-11-10T09:00:00Z", attachments: [] },
          { id: 2, kind: "reply_out", body_text: "Fixed: the sender was paused.", author_name: "Sam (MyOtherApp)", created_at: "2026-11-10T11:00:00Z", attachments: [{ id: 3, name: "log.pdf", url: "/api/v1/support/requests/8/attachments/3" }] },
        ],
        can_reply: true,
        can_survey: true,
        survey: null,
      };
    if (method === "POST" && path === "/api/v1/support/requests/8/replies") return { id: 4, kind: "reply_in", body_text: "Thanks!", case_id: 8, number: 1042, new_case: false };
    if (method === "POST" && path === "/api/v1/support/requests/8/survey") return { ok: true };
    if (method === "GET" && path === "/api/v1/clubs/info") return { id: 5, name: "Circuit Society" };
    throw routeMissing();
  };
  return { ...actual, api: { get: record("GET"), post: record("POST"), put: record("PUT"), patch: record("PATCH"), del: record("DELETE") } };
});

vi.mock("@/features/club", () => ({ useMyClub: () => ({ data: { id: 5, name: "Circuit Society" } }) }));

const { render } = await import("@/test/render");
const { SidebarNav } = await import("@/components/sidebar-nav");
const { HelpPage, HelpForm, RequestPage, rememberPage, requestContext, fileProblem } = await import("./index");

beforeEach(() => {
  calls.length = 0;
  server.old = false;
  server.unread = false;
});

const posted = (path: string) => calls.filter((c) => c.method === "POST" && c.path === path);

describe("Help in the rail", () => {
  it("shows for every role once the API has the help desk", async () => {
    render(<SidebarNav />);
    expect(await screen.findByRole("link", { name: /^Help/ })).toHaveAttribute("href", "/help");
  });

  it("counts the replies not yet read", async () => {
    server.unread = true;
    render(<SidebarNav />);
    expect(await screen.findByTestId("help-unread")).toHaveTextContent("1 new replies");
    expect(screen.getByRole("link", { name: /^Help/ })).toHaveAttribute("title", "Help · 1 new replies");
  });

  it("stays out on an API without it", async () => {
    server.old = true;
    render(<SidebarNav />);
    expect(await screen.findByRole("link", { name: "Events" })).toBeInTheDocument();
    await waitFor(() => expect(calls.some((c) => c.path === "/api/v1/support/help")).toBe(true));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole("link", { name: /^Help/ })).toBeNull();
    expect(calls.some((c) => c.path === "/api/v1/support/requests")).toBe(false);
  });
});

describe("the answers", () => {
  it("lists them by topic and filters them by what is typed", async () => {
    render(<HelpPage />);
    expect(await screen.findByText("Where is my ticket email?")).toBeInTheDocument();
    expect(screen.getByText("Tickets and registration")).toBeInTheDocument();
    expect(screen.getByText("General")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search the answers"), { target: { value: "name" } });
    expect(screen.queryByText("Where is my ticket email?")).toBeNull();
    expect(screen.getByText("Can I change my club's name?")).toBeInTheDocument();
  });
});

describe("asking for help", () => {
  it("says never to send passwords, OTPs or card numbers, and names the page it will attach", async () => {
    rememberPage("/events/77/attendees");
    render(<HelpForm onSent={vi.fn()} />);
    expect(await screen.findByText(/Never send passwords, OTPs or card numbers/)).toBeInTheDocument();
    expect(screen.getByText("We'll attach the page you were on (/events/77/attendees) and your club.")).toBeInTheDocument();
  });

  it("never remembers Help's own pages as where the club came from", () => {
    rememberPage("/events/12");
    rememberPage("/help");
    rememberPage("/help/requests/8");
    expect(requestContext("/events/12", "https://club-dashboard.myotherapp.in", 5)).toEqual({ platform: "dashboard", page_url: "https://club-dashboard.myotherapp.in/events/12", event_id: 12, club_id: 5 });
    expect(requestContext(null, "https://x", null)).toEqual({ platform: "dashboard" });
  });

  it("uploads the screenshots first, then sends the request with their keys, the page and the club", async () => {
    rememberPage("/events/77/attendees");
    const onSent = vi.fn();
    render(<HelpForm onSent={onSent} />);
    const send = await screen.findByRole("button", { name: /Send to MyOtherApp/ });
    expect(send).toBeDisabled();
    fireEvent.change(await screen.findByLabelText("What it's about"), { target: { value: "tickets" } });
    fireEvent.change(screen.getByLabelText("What happened"), { target: { value: "Attendees get no ticket emails." } });
    const shot = new File(["png"], "inbox.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Add screenshots"), { target: { files: [shot] } });
    expect(screen.getByText("inbox.png")).toBeInTheDocument();
    fireEvent.click(send);
    await waitFor(() => expect(onSent).toHaveBeenCalledWith(8));
    expect((posted("/api/v1/support/uploads")[0]!.body as FormData).getAll("files")).toEqual([shot]);
    expect(posted("/api/v1/support/requests")[0]!.body).toEqual({
      topic: "tickets",
      message: "Attendees get no ticket emails.",
      attachments: ["k0"],
      context: { platform: "dashboard", page_url: `${window.location.origin}/events/77/attendees`, event_id: 77, club_id: 5 },
    });
  });

  it("refuses a file that isn't a picture or a PDF, and keeps three at most", async () => {
    expect(fileProblem(new File(["x"], "a.exe", { type: "application/x-msdownload" }))).toMatch(/isn't a picture or a PDF/);
    expect(fileProblem(new File([new Uint8Array(6 * 1024 * 1024)], "big.png", { type: "image/png" }))).toMatch(/over 5 MB/);
    render(<HelpForm onSent={vi.fn()} />);
    const pick = await screen.findByLabelText("Add screenshots");
    fireEvent.change(pick, { target: { files: [new File(["x"], "virus.exe", { type: "application/x-msdownload" })] } });
    expect(screen.getByText("virus.exe isn't a picture or a PDF.")).toHaveAttribute("role", "alert");
    const four = ["a", "b", "c", "d"].map((n) => new File(["x"], `${n}.png`, { type: "image/png" }));
    fireEvent.change(pick, { target: { files: four } });
    expect(screen.getByText("c.png")).toBeInTheDocument();
    expect(screen.queryByText("d.png")).toBeNull();
    expect(screen.queryByLabelText("Add screenshots")).toBeNull();
  });
});

describe("a request", () => {
  it("shows the conversation, opens files through the gateway, and sends a reply", async () => {
    render(<RequestPage requestId={8} />);
    expect(await screen.findByText("Fixed: the sender was paused.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "log.pdf" })).toHaveAttribute("href", "/api/gateway/api/v1/support/requests/8/attachments/3");
    fireEvent.change(screen.getByLabelText("Reply"), { target: { value: "Thanks!" } });
    fireEvent.click(screen.getByRole("button", { name: /^Send$/ }));
    await waitFor(() => expect(posted("/api/v1/support/requests/8/replies")[0]?.body).toEqual({ message: "Thanks!", attachments: [] }));
  });

  it("asks once it is solved: Did we solve it?", async () => {
    render(<RequestPage requestId={8} />);
    const survey = await screen.findByRole("region", { name: "Did we solve it?" });
    fireEvent.click(within(survey).getByRole("button", { name: /Yes/ }));
    await waitFor(() => expect(posted("/api/v1/support/requests/8/survey")[0]?.body).toEqual({ solved: true }));
  });
});
