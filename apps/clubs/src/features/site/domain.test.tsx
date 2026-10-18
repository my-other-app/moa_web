import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { toApiError } from "@moa/api";
import { toast } from "@moa/ui";

/**
 * The Website page's Custom domain card, against the backend's contract
 * (built with fixtures while the backend is written):
 *
 *   GET    /clubs/site/domain        → {available, entitled, default_host, domain}
 *   PUT    /clubs/site/domain {host} → the same; 422 INVALID_HOST,
 *          422 APEX_NOT_SUPPORTED, 409 HOST_TAKEN, 403 PLAN_FEATURE_LOCKED,
 *          503 DOMAINS_UNAVAILABLE, 502 CLOUDFLARE_ERROR
 *   POST   /clubs/site/domain/check  → the same
 *   DELETE /clubs/site/domain        → the same, domain null
 *
 * The owner and team admins may write; anyone else reads, or is refused
 * with a 403 that is not the plan's.
 */

const DOMAIN_PATH = "/api/v1/clubs/site/domain";
const DEFAULT_HOST = "circuit-society.myotherapp.in";

const RECORDS = [
  { type: "CNAME", name: "www.theirclub.org", value: "sites.myotherapp.in", purpose: "route" },
  { type: "TXT", name: "_cf-custom-hostname.www.theirclub.org", value: "4f1c2a9e-7b1d-4c55-9a51-1f0e8d2b6c11", purpose: "ownership" },
  { type: "TXT", name: "_acme-challenge.www.theirclub.org", value: "Jq8w2nTzX0bYk3Q-ssl-token", purpose: "ssl" },
];

const domainOf = (over: Record<string, unknown> = {}) => ({
  host: "www.theirclub.org",
  status: "pending",
  records: RECORDS.map((r) => ({ ...r, name: r.name.replace("www.theirclub.org", String(over.host ?? "www.theirclub.org")) })),
  ssl_status: "pending_validation",
  last_error: null as string | null,
  verified_at: null as string | null,
  created_at: "2026-10-18T09:00:00Z",
  ...over,
});
const siteOf = (domain: ReturnType<typeof domainOf> | null, over: Record<string, unknown> = {}) => ({ available: true, entitled: true, default_host: DEFAULT_HOST, domain, ...over });

const CATALOG = {
  currency: "INR",
  yearly_months_free: 2,
  plans: [
    { id: 1, key: "starter", name: "Starter", limits: {}, features: [{ key: "website", label: "Club website", included: true }, { key: "custom_domain", label: "Your own domain for the club website", included: false }] },
    { id: 2, key: "growth", name: "Growth", limits: {}, features: [{ key: "website", label: "Club website", included: true }, { key: "custom_domain", label: "Your own domain for the club website", included: true }] },
  ],
};
const entOf = (customDomain: boolean) => ({ plan_key: customDomain ? "growth" : "starter", plan_name: customDomain ? "Growth" : "Starter", limits: {}, features: { website: true, custom_domain: customDomain }, usage: {}, configured: true, enforced: true });

const CAPS = { manage_access: true, see_access: true, money: true, club_profile: true, edit_events: true, delete_events: true, door: true };
const meOf = (role: string) => ({ role, role_label: role, role_description: "", can: role === "owner" ? CAPS : { ...CAPS, manage_access: false, money: false }, club_id: 5, club_name: "Circuit Society", member: null });

/** A refusal exactly as the gateway hands it over, through the parser the app uses. */
const refusal = (status: number, body: Record<string, unknown>) => toApiError(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

type Answer = () => unknown | Promise<unknown>;
const state = {
  domain: siteOf(null) as ReturnType<typeof siteOf>,
  role: "owner",
  ent: entOf(true) as Record<string, unknown>,
  /** When set, the read is refused with it. */
  readError: null as Error | null,
  put: null as null | ((host: string) => unknown),
  check: null as null | Answer,
};
const calls: Array<{ method: string; path: string; body?: unknown }> = [];

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        if (path === DOMAIN_PATH) {
          if (state.readError) throw state.readError;
          return structuredClone(state.domain);
        }
        if (path === "/api/v1/clubs/access/me") return meOf(state.role);
        if (path === "/api/v1/clubs/entitlements") return state.ent;
        if (path === "/api/v1/plans") return CATALOG;
        throw new Error(`unstubbed GET ${path}`);
      }),
      put: vi.fn(async (path: string, body: { host: string }) => {
        calls.push({ method: "PUT", path, body });
        if (state.put) return state.put(body.host);
        state.domain = siteOf(domainOf({ host: body.host }));
        return structuredClone(state.domain);
      }),
      post: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "POST", path, body });
        if (path === `${DOMAIN_PATH}/check`) return state.check ? state.check() : structuredClone(state.domain);
        throw new Error(`unstubbed POST ${path}`);
      }),
      del: vi.fn(async (path: string) => {
        calls.push({ method: "DELETE", path });
        state.domain = { ...state.domain, domain: null };
        return structuredClone(state.domain);
      }),
      patch: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { DomainCard } = await import("./components/domain-card");
const { PlanLockHost, planState } = await import("@/features/plan");
const { entitlementsSchema, catalogSchema } = await import("@/features/billing/schemas");
const { normaliseHost, hostProblem, zoneOf, shortName, sslStatus, domainPollInterval, connectProblem, currentDomain, siteDomainSchema, DOMAIN_POLL_MS } = await import("./domain");

function renderCard() {
  return render(
    <>
      <PlanLockHost />
      <DomainCard />
    </>,
  );
}
const card = () => within(screen.getByRole("region", { name: "Custom domain" }));
const writes = () => calls.filter((c) => c.method !== "GET");
const domainReads = () => calls.filter((c) => c.method === "GET" && c.path === DOMAIN_PATH).length;
/** Waits until the role is known, so what the card offers is the role's answer, not the owner default. */
const roleKnown = () => waitFor(() => expect(calls.some((c) => c.path === "/api/v1/clubs/access/me")).toBe(true));

beforeEach(() => {
  calls.length = 0;
  state.domain = siteOf(null);
  state.role = "owner";
  state.ent = entOf(true);
  state.readError = null;
  state.put = null;
  state.check = null;
  vi.restoreAllMocks();
  Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => undefined) } });
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── The rules ───────────────────────────────────────────────────────────

describe("the host the club types", () => {
  it("normalises what is typed to the host it means", () => {
    expect(normaliseHost("www.theirclub.org")).toBe("www.theirclub.org");
    expect(normaliseHost("  WWW.TheirClub.ORG  ")).toBe("www.theirclub.org");
    expect(normaliseHost("https://www.theirclub.org/about?x=1#top")).toBe("www.theirclub.org");
    expect(normaliseHost("http://www.theirclub.org:8080")).toBe("www.theirclub.org");
    expect(normaliseHost("//www.theirclub.org/")).toBe("www.theirclub.org");
    expect(normaliseHost("www.theirclub.org.")).toBe("www.theirclub.org");
    expect(normaliseHost("admin@www.theirclub.org")).toBe("www.theirclub.org");
    expect(normaliseHost("www.bücher.de")).toBe("www.xn--bcher-kva.de");
    expect(normaliseHost("")).toBe("");
  });

  it("says what is wrong before the server is asked, and leaves bare domains to the server", () => {
    expect(hostProblem("")).toBeNull();
    expect(hostProblem("www.theirclub.org")).toBeNull();
    expect(hostProblem("club.theirclub.co.in")).toBeNull();
    // Whether a name is bare is the registry's business: the server says.
    expect(hostProblem("theirclub.org")).toBeNull();
    expect(hostProblem("theirclub")).toMatch(/Add the ending/);
    expect(hostProblem("www.their_club.org")).toMatch(/letters, numbers, dots and hyphens/);
    expect(hostProblem("www..theirclub.org")).toMatch(/two dots/);
    expect(hostProblem("-www.theirclub.org")).toMatch(/isn't a valid domain/);
    expect(hostProblem(`${"a".repeat(64)}.org`)).toMatch(/isn't a valid domain/);
    expect(hostProblem("www.theirclub.123")).toMatch(/ending/);
    expect(hostProblem("circuit.myotherapp.in")).toMatch(/MyOtherApp address/);
  });

  it("finds the bought domain and each record's short name, for providers that add the domain themselves", () => {
    expect(zoneOf("www.theirclub.org")).toBe("theirclub.org");
    expect(zoneOf("club.events.theirclub.org")).toBe("theirclub.org");
    expect(zoneOf("www.theirclub.co.in")).toBe("theirclub.co.in");
    expect(zoneOf("www.theirclub.in")).toBe("theirclub.in");
    expect(shortName("www.theirclub.org", "theirclub.org")).toBe("www");
    expect(shortName("_cf-custom-hostname.www.theirclub.org.", "theirclub.org")).toBe("_cf-custom-hostname.www");
    expect(shortName("theirclub.org", "theirclub.org")).toBeNull();
    expect(shortName("www.other.org", "theirclub.org")).toBeNull();
  });

  it("words the certificate", () => {
    expect(sslStatus("active")).toEqual({ label: "Active · HTTPS on", tone: "success" });
    expect(sslStatus("pending_validation").label).toBe("Being issued");
    expect(sslStatus("initializing").tone).toBe("warning");
    expect(sslStatus("validation_timed_out").tone).toBe("destructive");
    expect(sslStatus(null).label).toBe("Not started");
  });

  it("polls only a pending domain", () => {
    const parse = (d: unknown) => siteDomainSchema.parse(d);
    expect(domainPollInterval(parse(siteOf(domainOf())))).toBe(DOMAIN_POLL_MS);
    expect(DOMAIN_POLL_MS).toBe(30_000);
    for (const status of ["active", "failed", "paused", "removed"]) expect(domainPollInterval(parse(siteOf(domainOf({ status }))))).toBe(false);
    expect(domainPollInterval(parse(siteOf(null)))).toBe(false);
    expect(domainPollInterval(undefined)).toBe(false);
    // A removed one is no domain at all.
    expect(currentDomain(parse(siteOf(domainOf({ status: "removed" }))))).toBeNull();
  });

  it("reads each refusal for the field, with the www. one for a bare domain, and leaves the plan's to the dialog", async () => {
    expect(connectProblem(await refusal(422, { message: "Bare domains can't point here. Use www.theirclub.org.", error_code: "APEX_NOT_SUPPORTED" }), "theirclub.org")).toEqual({
      code: "APEX_NOT_SUPPORTED",
      message: "Bare domains can't point here. Use www.theirclub.org.",
      suggestion: "www.theirclub.org",
    });
    expect(connectProblem(await refusal(409, { message: "Another site already uses www.theirclub.org.", error_code: "HOST_TAKEN" }), "www.theirclub.org")).toMatchObject({ code: "HOST_TAKEN", suggestion: null });
    // No words from the server: ours for the code.
    expect(connectProblem(await refusal(502, { error_code: "CLOUDFLARE_ERROR" }), "www.theirclub.org")?.message).toBe("We couldn't reach our domain provider. Try again in a few minutes.");
    expect(connectProblem(await refusal(403, { message: "Locked", error_code: "PLAN_FEATURE_LOCKED", errors: { feature: "custom_domain" } }), "www.theirclub.org")).toBeNull();
  });

  it("is a Growth feature in the club's words, and can be locked on the server's word", () => {
    const ent = entitlementsSchema.parse({ ...entOf(true), plan_key: "starter", plan_name: "Starter" });
    const p = planState(ent, catalogSchema.parse(CATALOG));
    // The entitlements say it is open, the domain endpoint may still say not entitled.
    expect(p.featureLock("custom_domain")).toBeNull();
    expect(p.lockFor("custom_domain")).toMatchObject({ kind: "feature", key: "custom_domain", label: "Your own domain for the club website", requiredPlanName: "Growth", planName: "Starter" });
    // Without the catalogue, the seeded tier.
    expect(planState(entitlementsSchema.parse(entOf(false)), null).featureLock("custom_domain")).toMatchObject({ label: "Your own domain for the club website", requiredPlanName: "Growth" });
  });
});

// ─── The card ────────────────────────────────────────────────────────────

describe("the custom domain card", () => {
  it("says only that it is coming when the platform has none, or the server predates them", async () => {
    state.domain = siteOf(null, { available: false });
    const { unmount } = renderCard();
    expect(await screen.findByText("Custom domains are coming soon.")).toBeInTheDocument();
    expect(card().queryByRole("textbox")).not.toBeInTheDocument();
    expect(card().queryByRole("button")).not.toBeInTheDocument();
    unmount();

    state.readError = await refusal(404, { detail: "Not Found" });
    renderCard();
    expect(await screen.findByText("Custom domains are coming soon.")).toBeInTheDocument();
  });

  it("is locked off Growth: a badge, the notice, the current address and the upgrade dialog", async () => {
    state.domain = siteOf(null, { entitled: false });
    state.ent = entOf(false);
    renderCard();
    expect(await screen.findByText("Use your own domain, like www.yourclub.org — on Growth and up.")).toBeInTheDocument();
    expect(card().getByText(DEFAULT_HOST)).toBeInTheDocument();
    expect(card().getByLabelText("Locked: part of Growth and up")).toBeInTheDocument();
    expect(card().queryByLabelText("Your domain")).not.toBeInTheDocument();
    fireEvent.click(card().getByRole("button", { name: "Upgrade" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Your own domain for the club website is part of Growth and up")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "See plans" })).toHaveAttribute("href", "/billing");
  });

  it("is locked on the domain endpoint's word even before the entitlements say so", async () => {
    state.domain = siteOf(null, { entitled: false });
    state.ent = entOf(true);
    renderCard();
    expect(await screen.findByText(/Use your own domain, like www\.yourclub\.org — on Growth and up\./)).toBeInTheDocument();
  });

  it("connects a domain: shows the host it means as it is typed, and sends that", async () => {
    renderCard();
    const input = await screen.findByLabelText("Your domain");
    expect(input).toHaveAttribute("placeholder", "www.yourclub.org");
    expect(card().getByText("Use www or another subdomain. Forward your bare domain (yourclub.org) to it at your registrar.")).toBeInTheDocument();
    const connect = card().getByRole("button", { name: /Connect/ });
    expect(connect).toBeDisabled();

    fireEvent.change(input, { target: { value: "theirclub" } });
    expect(card().getByText("Add the ending too, like .org or .in.")).toBeInTheDocument();
    expect(connect).toBeDisabled();

    fireEvent.change(input, { target: { value: "HTTPS://WWW.TheirClub.org/about" } });
    expect(card().getByText("www.theirclub.org", { selector: "code" })).toBeInTheDocument();
    expect(card().getByText(/We.ll connect/)).toBeInTheDocument();
    fireEvent.click(connect);
    await waitFor(() => expect(writes()).toEqual([{ method: "PUT", path: DOMAIN_PATH, body: { host: "www.theirclub.org" } }]));
    // Now it waits for DNS.
    expect(await card().findByText("Add these records")).toBeInTheDocument();
    expect(card().getByText("Waiting for DNS")).toBeInTheDocument();
  });

  it("offers www. in one click when the server refuses a bare domain", async () => {
    const apex = await refusal(422, { message: "Bare domains can't point here. Use www.theirclub.org.", error_code: "APEX_NOT_SUPPORTED" });
    state.put = (host) => {
      if (host === "theirclub.org") throw apex;
      state.domain = siteOf(domainOf({ host }));
      return structuredClone(state.domain);
    };
    renderCard();
    fireEvent.change(await screen.findByLabelText("Your domain"), { target: { value: "theirclub.org" } });
    fireEvent.click(card().getByRole("button", { name: /Connect/ }));
    const alert = await card().findByRole("alert");
    expect(within(alert).getByText("Bare domains can't point here. Use www.theirclub.org.")).toBeInTheDocument();
    fireEvent.click(within(alert).getByRole("button", { name: "Use www.theirclub.org" }));
    await waitFor(() => expect(writes().map((w) => w.body)).toEqual([{ host: "theirclub.org" }, { host: "www.theirclub.org" }]));
    expect(await card().findByText("Add these records")).toBeInTheDocument();
  });

  it("shows each refusal under the field in the server's words, never as a toast", async () => {
    const toasted = vi.spyOn(toast, "error");
    for (const [status, code, message] of [
      [422, "INVALID_HOST", "That isn't a hostname we can use."],
      [409, "HOST_TAKEN", "Another site already uses www.theirclub.org."],
      [503, "DOMAINS_UNAVAILABLE", "Custom domains are switched off for now."],
      [502, "CLOUDFLARE_ERROR", "Cloudflare did not answer. Try again."],
    ] as const) {
      const err = await refusal(status, { message, error_code: code });
      state.put = () => {
        throw err;
      };
      calls.length = 0;
      const { unmount } = renderCard();
      fireEvent.change(await screen.findByLabelText("Your domain"), { target: { value: "www.theirclub.org" } });
      fireEvent.click(card().getByRole("button", { name: /Connect/ }));
      const alert = await card().findByRole("alert");
      expect(within(alert).getByText(message)).toBeInTheDocument();
      expect(within(alert).queryByRole("button")).not.toBeInTheDocument();
      // Unavailable means the card is out of date: it is read again.
      if (code === "DOMAINS_UNAVAILABLE") await waitFor(() => expect(domainReads()).toBe(2));
      // Typing again clears it.
      fireEvent.change(screen.getByLabelText("Your domain"), { target: { value: "www.theirclub.org " } });
      await waitFor(() => expect(card().queryByRole("alert")).not.toBeInTheDocument());
      unmount();
    }
    expect(toasted).not.toHaveBeenCalled();
  });

  it("goes to coming soon when connecting finds custom domains switched off", async () => {
    const err = await refusal(503, { message: "Custom domains are switched off for now.", error_code: "DOMAINS_UNAVAILABLE" });
    state.put = () => {
      state.domain = siteOf(null, { available: false });
      throw err;
    };
    renderCard();
    fireEvent.change(await screen.findByLabelText("Your domain"), { target: { value: "www.theirclub.org" } });
    fireEvent.click(card().getByRole("button", { name: /Connect/ }));
    expect(await screen.findByText("Custom domains are coming soon.")).toBeInTheDocument();
  });

  it("opens the upgrade dialog, not an error, when the plan refuses the connect", async () => {
    const err = await refusal(403, { message: "Custom domains are on Growth and up.", error_code: "PLAN_FEATURE_LOCKED", errors: { feature: "custom_domain", label: "Your own domain for the club website", required_plan: "growth", required_plan_name: "Growth" } });
    state.put = () => {
      throw err;
    };
    const toasted = vi.spyOn(toast, "error");
    renderCard();
    fireEvent.change(await screen.findByLabelText("Your domain"), { target: { value: "www.theirclub.org" } });
    fireEvent.click(card().getByRole("button", { name: /Connect/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Your own domain for the club website is part of Growth and up")).toBeInTheDocument();
    expect(card().queryByRole("alert")).not.toBeInTheDocument();
    // Still the owner's form: a plan refusal is not a role's.
    expect(card().getByLabelText("Your domain")).toBeInTheDocument();
    expect(toasted).not.toHaveBeenCalled();
  });

  it("guides a pending domain: the steps, the records with copy buttons and short names, checking and removing", async () => {
    state.domain = siteOf(domainOf({ last_error: "No CNAME found for www.theirclub.org yet." }));
    const info = vi.spyOn(toast, "info");
    renderCard();
    const steps = await card().findByRole("list", { name: "Setup steps" });
    expect(within(steps).getByText("Sign in where you bought your domain (GoDaddy, Hostinger, Namecheap, Google/Squarespace, Cloudflare…)")).toBeInTheDocument();
    expect(within(steps).getByText("Add these records")).toBeInTheDocument();
    expect(within(steps).getByText("We check automatically. This usually takes a few minutes, but can take up to 24 hours.")).toBeInTheDocument();
    expect(card().getByText(/Connecting/)).toHaveTextContent(`Connecting www.theirclub.org. Until it's done, your site stays at ${DEFAULT_HOST}.`);

    const table = card().getByRole("table", { name: "DNS records" });
    for (const h of ["Type", "Name", "Value", "Purpose"]) expect(within(table).getByRole("columnheader", { name: h })).toBeInTheDocument();
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(3);
    expect(within(rows[0]!).getByText("CNAME")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("sites.myotherapp.in")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("Points your domain at your site")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("Proves the domain is yours")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("Lets us issue the HTTPS certificate")).toBeInTheDocument();
    // The short form for providers that add the domain to the name themselves.
    expect(within(rows[0]!).getByText("www", { selector: "code" })).toBeInTheDocument();
    expect(within(rows[1]!).getByText("_cf-custom-hostname.www", { selector: "code" })).toBeInTheDocument();
    expect(card().getByText((_, el) => el?.tagName === "P" && /^Tip: .*add theirclub\.org to the name themselves/.test(el.textContent ?? ""))).toBeInTheDocument();

    fireEvent.click(card().getByRole("button", { name: "Copy CNAME value (routing)" }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith("sites.myotherapp.in"));
    fireEvent.click(card().getByRole("button", { name: "Copy TXT name (ownership)" }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith("_cf-custom-hostname.www.theirclub.org"));
    fireEvent.click(card().getByRole("button", { name: "Copy TXT value (certificate)" }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith("Jq8w2nTzX0bYk3Q-ssl-token"));
    fireEvent.click(card().getByRole("button", { name: "Copy CNAME short name (routing)" }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith("www"));

    // The last check's words.
    expect(card().getByText("No CNAME found for www.theirclub.org yet.")).toBeInTheDocument();

    // Help, folded away, with the grey cloud.
    const help = card().getByText("Help for GoDaddy, Hostinger, Namecheap and Cloudflare").closest("details")!;
    expect(help).not.toHaveAttribute("open");
    for (const p of ["GoDaddy", "Hostinger", "Namecheap", "Cloudflare"]) expect(within(help).getByText(p)).toBeInTheDocument();
    expect(within(help).getByText(/DNS only \(grey cloud\)/)).toBeInTheDocument();

    fireEvent.click(card().getByRole("button", { name: /Check now/ }));
    await waitFor(() => expect(writes()).toEqual([{ method: "POST", path: `${DOMAIN_PATH}/check`, body: {} }]));
    await waitFor(() => expect(info).toHaveBeenCalledWith("Not found yet. We'll keep checking."));

    fireEvent.click(card().getByRole("button", { name: /^Remove$/ }));
    let confirm = await screen.findByRole("alertdialog");
    expect(within(confirm).getByText("Remove www.theirclub.org?")).toBeInTheDocument();
    fireEvent.click(within(confirm).getByRole("button", { name: "Keep it" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(writes()).toHaveLength(1);

    fireEvent.click(card().getByRole("button", { name: /^Remove$/ }));
    confirm = await screen.findByRole("alertdialog");
    fireEvent.click(within(confirm).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(writes().at(-1)).toEqual({ method: "DELETE", path: DOMAIN_PATH }));
    // Back to choosing one.
    expect(await card().findByLabelText("Your domain")).toBeInTheDocument();
  });

  it("says when a check finds it live", async () => {
    state.domain = siteOf(domainOf());
    state.check = () => {
      state.domain = siteOf(domainOf({ status: "active", ssl_status: "active", verified_at: "2026-10-18T09:20:00Z" }));
      return structuredClone(state.domain);
    };
    const ok = vi.spyOn(toast, "success");
    renderCard();
    fireEvent.click(await card().findByRole("button", { name: /Check now/ }));
    expect(await card().findByText(/Your site is live at/)).toBeInTheDocument();
    expect(ok).toHaveBeenCalledWith("Your site is live at www.theirclub.org");
  });

  it("shows a live domain: the address to open and copy, the forward, the certificate, and removing it", async () => {
    state.domain = siteOf(domainOf({ status: "active", ssl_status: "active", verified_at: "2026-10-18T09:20:00Z" }));
    renderCard();
    const live = await card().findByText(/Your site is live at/);
    expect(live).toHaveTextContent("Your site is live at https://www.theirclub.org");
    expect(card().getByText("Live", { selector: "[data-slot=badge]" })).toBeInTheDocument();
    expect(card().getByRole("link", { name: /Open/ })).toHaveAttribute("href", "https://www.theirclub.org");
    fireEvent.click(card().getByRole("button", { name: /^Copy$/ }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith("https://www.theirclub.org"));
    expect(card().getByText(`${DEFAULT_HOST} now forwards here.`)).toBeInTheDocument();
    expect(card().getByText("Active · HTTPS on")).toBeInTheDocument();
    expect(card().queryByRole("table")).not.toBeInTheDocument();

    fireEvent.click(card().getByRole("button", { name: /Remove domain/ }));
    const confirm = await screen.findByRole("alertdialog");
    expect(within(confirm).getByText(`Your site goes back to ${DEFAULT_HOST}, and www.theirclub.org stops showing it. You can connect a domain again later.`)).toBeInTheDocument();
    fireEvent.click(within(confirm).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(writes()).toEqual([{ method: "DELETE", path: DOMAIN_PATH }]));
    expect(await card().findByLabelText("Your domain")).toBeInTheDocument();
  });

  it("shows a paused domain with the way to upgrade", async () => {
    state.domain = siteOf(domainOf({ status: "paused", ssl_status: "active" }), { entitled: false });
    state.ent = entOf(false);
    renderCard();
    expect(await card().findByText(`Paused — your plan no longer includes custom domains. Visitors are sent to ${DEFAULT_HOST}. Upgrade within 30 days to keep it.`)).toBeInTheDocument();
    expect(card().getByText("www.theirclub.org")).toBeInTheDocument();
    fireEvent.click(card().getByRole("button", { name: /Upgrade/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Your own domain for the club website is part of Growth and up")).toBeInTheDocument();
  });

  it("shows a failed domain's error, with Check again and Remove", async () => {
    state.domain = siteOf(domainOf({ status: "failed", last_error: "The CNAME for www.theirclub.org points to theirclub.org, not sites.myotherapp.in." }));
    renderCard();
    expect(await card().findByText("The CNAME for www.theirclub.org points to theirclub.org, not sites.myotherapp.in.")).toBeInTheDocument();
    expect(card().getByText("Not connected", { selector: "[data-slot=badge]" })).toBeInTheDocument();
    expect(card().getByRole("table", { name: "DNS records" })).toBeInTheDocument();
    fireEvent.click(card().getByRole("button", { name: /Check again/ }));
    await waitFor(() => expect(writes()).toEqual([{ method: "POST", path: `${DOMAIN_PATH}/check`, body: {} }]));
    expect(card().getByRole("button", { name: /^Remove$/ })).toBeInTheDocument();
  });

  it("toasts a failed check in the server's words", async () => {
    state.domain = siteOf(domainOf());
    const err = await refusal(502, { message: "Cloudflare did not answer. Try again.", error_code: "CLOUDFLARE_ERROR" });
    state.check = () => {
      throw err;
    };
    const toasted = vi.spyOn(toast, "error");
    renderCard();
    fireEvent.click(await card().findByRole("button", { name: /Check now/ }));
    await waitFor(() => expect(toasted).toHaveBeenCalledWith("Cloudflare did not answer. Try again."));
  });
});

// ─── Polling ─────────────────────────────────────────────────────────────

describe("polling a pending domain", () => {
  it("reads it again every 30 s while the page is open, and stops once it is live", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    state.domain = siteOf(domainOf());
    renderCard();
    await card().findByText("Add these records");
    expect(domainReads()).toBe(1);

    await vi.advanceTimersByTimeAsync(DOMAIN_POLL_MS);
    await waitFor(() => expect(domainReads()).toBe(2));

    state.domain = siteOf(domainOf({ status: "active", ssl_status: "active", verified_at: "2026-10-18T09:20:00Z" }));
    await vi.advanceTimersByTimeAsync(DOMAIN_POLL_MS);
    await waitFor(() => expect(domainReads()).toBe(3));
    expect(await card().findByText(/Your site is live at/)).toBeInTheDocument();

    // Live: no more reads.
    await vi.advanceTimersByTimeAsync(DOMAIN_POLL_MS * 3);
    expect(domainReads()).toBe(3);
  });

  it("stops when the page is closed", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    state.domain = siteOf(domainOf());
    const { unmount } = renderCard();
    await card().findByText("Add these records");
    expect(domainReads()).toBe(1);
    unmount();
    await vi.advanceTimersByTimeAsync(DOMAIN_POLL_MS * 3);
    expect(domainReads()).toBe(1);
  });

  it("never starts for a live, failed or paused domain", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    for (const status of ["active", "failed", "paused"]) {
      calls.length = 0;
      state.domain = siteOf(domainOf({ status }));
      const { unmount } = renderCard();
      await waitFor(() => expect(domainReads()).toBe(1));
      await vi.advanceTimersByTimeAsync(DOMAIN_POLL_MS * 2);
      expect(domainReads()).toBe(1);
      unmount();
    }
  });
});

// ─── Who may change it ───────────────────────────────────────────────────

describe("who may change it", () => {
  it("lets a team admin connect, like the owner", async () => {
    state.role = "admin";
    renderCard();
    await roleKnown();
    expect(await card().findByLabelText("Your domain")).toBeInTheDocument();
    expect(card().queryByText("Only the club's owner and admins can change this.")).not.toBeInTheDocument();
  });

  it("shows an editor where it stands without a way to change it", async () => {
    state.role = "editor";
    state.domain = siteOf(domainOf());
    const { unmount } = renderCard();
    await roleKnown();
    await card().findByText("Add these records");
    await waitFor(() => expect(card().queryByRole("button", { name: /Check now/ })).not.toBeInTheDocument());
    expect(card().getByRole("table", { name: "DNS records" })).toBeInTheDocument();
    expect(card().queryByRole("button", { name: /Remove/ })).not.toBeInTheDocument();
    expect(card().getByText("Only the club's owner and admins can change this.")).toBeInTheDocument();
    unmount();

    for (const [domain, gone] of [
      [domainOf({ status: "active", ssl_status: "active" }), /Remove domain/],
      [domainOf({ status: "failed", last_error: "No CNAME." }), /Check again/],
      [domainOf({ status: "paused" }), /Upgrade/],
    ] as const) {
      calls.length = 0;
      state.domain = siteOf(domain);
      const r = renderCard();
      await roleKnown();
      await waitFor(() => expect(card().getByText("Only the club's owner and admins can change this.")).toBeInTheDocument());
      expect(card().queryByRole("button", { name: gone })).not.toBeInTheDocument();
      r.unmount();
    }

    calls.length = 0;
    state.domain = siteOf(null);
    renderCard();
    await roleKnown();
    expect(await card().findByText(/No custom domain yet/)).toHaveTextContent(`No custom domain yet. Your site is at ${DEFAULT_HOST}.`);
    expect(card().queryByLabelText("Your domain")).not.toBeInTheDocument();
  });

  it("tells someone refused the read who can see it, calmly", async () => {
    state.role = "door";
    state.readError = await refusal(403, { message: "Your role can't see the website settings.", error_code: "ROLE_FORBIDDEN" });
    renderCard();
    expect(await card().findByText("Only the club's owner and admins can see or change the custom domain.")).toBeInTheDocument();
  });

  it("turns read-only when the server refuses a write for the role, not the plan", async () => {
    const err = await refusal(403, { message: "Only the club's owner and admins can do that." });
    state.put = () => {
      throw err;
    };
    const toasted = vi.spyOn(toast, "error");
    renderCard();
    fireEvent.change(await screen.findByLabelText("Your domain"), { target: { value: "www.theirclub.org" } });
    fireEvent.click(card().getByRole("button", { name: /Connect/ }));
    expect(await card().findByText("Only the club's owner and admins can change this.")).toBeInTheDocument();
    expect(card().queryByLabelText("Your domain")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(toasted).not.toHaveBeenCalled();
  });

  it("turns read-only when a check is refused for the role, without a toast", async () => {
    state.domain = siteOf(domainOf());
    const err = await refusal(403, { message: "Forbidden", error_code: "ROLE_FORBIDDEN" });
    state.check = () => {
      throw err;
    };
    const toasted = vi.spyOn(toast, "error");
    renderCard();
    fireEvent.click(await card().findByRole("button", { name: /Check now/ }));
    expect(await card().findByText("Only the club's owner and admins can change this.")).toBeInTheDocument();
    expect(card().queryByRole("button", { name: /Check now/ })).not.toBeInTheDocument();
    expect(toasted).not.toHaveBeenCalled();
  });
});
