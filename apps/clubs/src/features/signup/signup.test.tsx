import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError, toApiError } from "@moa/api";

import plans from "../__fixtures__/plans.json";
import orgs from "../__fixtures__/orgs.json";
import interests from "../__fixtures__/interests.json";

/**
 * Applying to join against POST /clubs/create as the backend answers it: a
 * multipart form in; a duplicate email as a 400 with `errors.email`, a taken
 * club name as a bare message, a field rule as the 422 handler's
 * `{message, errors: {field: "msg"}}`, too many applications as a 429. The
 * pickers read /orgs/list and /interests/list, both public.
 */

const state: { plans: unknown; interests: unknown; create: (body: FormData) => unknown } = {
  plans,
  interests,
  create: () => ({ id: 77, name: "Circuit Society" }),
};
const posts: Array<{ path: string; body: FormData }> = [];

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  const answer = (value: unknown) => {
    if (value instanceof Error) throw value;
    return value;
  };
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        if (path === "/api/v1/plans") return answer(state.plans);
        if (path === "/api/v1/orgs/list") return orgs;
        if (path === "/api/v1/interests/list") return answer(state.interests);
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body: FormData) => {
        posts.push({ path, body });
        if (path === "/api/v1/clubs/create") return state.create(body);
        throw new Error(`unstubbed POST ${path}`);
      }),
      put: vi.fn(),
      patch: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { SignupFlow } = await import("./components/signup-flow");
const { toFormData, emptySignup, signupErrors, resolvePlanKey, signupSchema } = await import("./schemas");
const { catalogSchema } = await import("@/features/billing");

beforeEach(() => {
  posts.length = 0;
  Object.assign(state, { plans, interests, create: () => ({ id: 77, name: "Circuit Society" }) });
});

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const next = () => fireEvent.click(screen.getByRole("button", { name: "Continue" }));
const onStep = (title: string) => screen.findByRole("form", { name: title });

async function fillClub(name = "Circuit Society") {
  type("Club name", name);
  type("About", "We build robots.");
  next();
  await onStep("Contact and login");
}

async function fillContact() {
  type("Login email", "circuit@example.com");
  type("Password", "letmein1");
  type("Password again", "letmein1");
  type("Contact phone", "+91 98470-12345");
  type("Contact email", "hello@circuit.org");
  next();
  await onStep("Interests and links");
}

const entries = (form: FormData) => Object.fromEntries([...form.entries()].map(([k, v]) => [k, typeof v === "string" ? v : `file:${v.name}`]));

describe("step by step", () => {
  it("asks for a club name of 3 to 20 characters and counts as you type", async () => {
    render(<SignupFlow initialPlan="free" initialCycle="monthly" />);
    next();
    expect(await screen.findByText("At least 3 characters")).toBeInTheDocument();

    type("Club name", "A".repeat(21));
    expect(screen.getByText("21 / 20")).toHaveClass("text-refuse");
    next();
    expect(await screen.findByText("20 characters at most")).toBeInTheDocument();

    type("Club name", "Circuit Society");
    expect(screen.getByText("15 / 20")).not.toHaveClass("text-refuse");
    next();
    expect(await onStep("Contact and login")).toBeInTheDocument();
    expect(posts).toHaveLength(0);
  });

  it("holds the password to its rules and checks both copies match", async () => {
    render(<SignupFlow initialPlan="free" initialCycle="monthly" />);
    await fillClub();
    next();
    expect(await screen.findByText("Enter the email the club will sign in with")).toBeInTheDocument();
    expect(screen.getByText("At least 6 characters")).toBeInTheDocument();
    expect(screen.getByText("Type the password again")).toBeInTheDocument();

    type("Login email", "circuit@example.com");
    type("Password", "letmein1");
    type("Password again", "letmein2");
    type("Contact phone", "12");
    next();
    expect(await screen.findByText("The two passwords don't match")).toBeInTheDocument();
    expect(screen.getByText("Enter a phone number, like +91 98470 12345")).toBeInTheDocument();

    const rules = screen.getByRole("list", { name: "Password rules" });
    expect(within(rules).getByText("6 or more characters").closest("li")).toHaveAttribute("data-met", "true");
    expect(within(rules).getByText("Both passwords match").closest("li")).toHaveAttribute("data-met", "false");
    expect(posts).toHaveLength(0);
  });

  it("sends the whole application as multipart, with the plan from the pricing page", async () => {
    render(<SignupFlow initialPlan="growth" initialCycle="yearly" />);
    const logo = new File(["png"], "circuit.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Logo file"), { target: { files: [logo] } });
    expect(await screen.findByAltText("Logo preview")).toBeInTheDocument();
    await fillClub();
    await fillContact();

    fireEvent.click(await screen.findByRole("checkbox", { name: /Coding/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Photography/ }));
    expect(screen.getByText("2 interests picked")).toBeInTheDocument();
    type("Instagram", "https://instagram.com/circuit");
    next();
    await onStep("Review");

    expect(await screen.findByRole("radio", { name: /Growth/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /^Yearly/ })).toHaveAttribute("aria-checked", "true");
    expect(within(screen.getByRole("region", { name: "Interests and links" })).getByText("Coding, Photography")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Send application" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]!.path).toBe("/api/v1/clubs/create");
    expect(posts[0]!.body).toBeInstanceOf(FormData);
    expect(entries(posts[0]!.body)).toEqual({
      name: "Circuit Society",
      email: "circuit@example.com",
      password: "letmein1",
      contact_phone: "+919847012345",
      contact_email: "hello@circuit.org",
      about: "We build robots.",
      instagram: "https://instagram.com/circuit",
      interest_ids: "6,21",
      logo: "file:circuit.png",
      requested_plan: "growth",
      requested_cycle: "yearly",
    });
  });

  it("says thanks and what happens next", async () => {
    render(<SignupFlow initialPlan="free" initialCycle="monthly" />);
    await fillClub();
    await fillContact();
    next();
    await onStep("Review");
    fireEvent.click(screen.getByRole("button", { name: "Send application" }));

    const done = await screen.findByRole("status");
    expect(done).toHaveTextContent(
      "Thanks — Circuit Society is under review. We'll email circuit@example.com when it's approved, usually within a day. Then log in to choose your plan.",
    );
    expect(within(done).getByRole("link", { name: "Go to sign in" })).toHaveAttribute("href", "/login");
  });

  it("can change the plan at the end, and falls back to Free for one not on sale", async () => {
    render(<SignupFlow initialPlan="platinum" initialCycle="monthly" />);
    await fillClub();
    await fillContact();
    next();
    await onStep("Review");
    expect(await screen.findByRole("radio", { name: /^Free/ })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: /^Pro/ }));
    fireEvent.click(screen.getByRole("radio", { name: /^Yearly/ }));
    fireEvent.click(screen.getByRole("button", { name: "Send application" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(entries(posts[0]!.body)).toMatchObject({ requested_plan: "pro", requested_cycle: "yearly" });
  });

  it("keeps the pricing page's plan when the catalogue cannot load, and moves on when interests cannot", async () => {
    state.plans = new ApiError({ status: 404, message: "Not Found" });
    state.interests = new ApiError({ status: 503, message: "Unavailable" });
    render(<SignupFlow initialPlan="growth" initialCycle="yearly" />);
    await fillClub();
    await fillContact();
    expect(await screen.findByText(/Interests could not load just now/)).toBeInTheDocument();
    next();
    await onStep("Review");
    expect(await screen.findByText(/Growth, billed yearly — you'll confirm it after approval/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Send application" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(entries(posts[0]!.body)).toMatchObject({ requested_plan: "growth", requested_cycle: "yearly" });
  });
});

describe("the server's refusals", () => {
  async function submitAll() {
    render(<SignupFlow initialPlan="free" initialCycle="monthly" />);
    await fillClub();
    await fillContact();
    next();
    await onStep("Review");
    fireEvent.click(screen.getByRole("button", { name: "Send application" }));
  }

  it("takes a duplicate email back to its field", async () => {
    state.create = () => {
      throw new ApiError({ status: 400, message: "Invalid Request", fieldErrors: { email: "email already exists" } as unknown as Record<string, string[]> });
    };
    await submitAll();
    expect(await onStep("Contact and login")).toBeInTheDocument();
    expect(screen.getByText("There's already a club account with this email. Sign in instead, or use another address.")).toBeInTheDocument();
    expect(screen.getByLabelText("Login email")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Some details need another look.")).toBeInTheDocument();
  });

  it("takes a taken club name back to the first step", async () => {
    state.create = () => {
      throw new ApiError({ status: 400, message: "Club with this name already exists" });
    };
    await submitAll();
    expect(await onStep("Your club")).toBeInTheDocument();
    expect(screen.getByText("A club with this name is already on MyOtherApp. Try a different name.")).toBeInTheDocument();
  });

  it("asks to wait after too many tries", async () => {
    state.create = () => {
      throw new ApiError({ status: 429, message: "Rate limit exceeded: 5 per 1 minute" });
    };
    await submitAll();
    expect(await screen.findByText("Too many applications from this connection. Wait a few minutes, then send it again.")).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Review" })).toBeInTheDocument();
  });

  it("maps the 422 handler's field messages, the phone, and anything it cannot place", async () => {
    const invalid = await toApiError(new Response(JSON.stringify({ message: "Invalid request", errors: { name: "String should have at most 20 characters", password: "String should have at least 6 characters" } }), { status: 422 }));
    expect(signupErrors(invalid)).toEqual({
      fields: { name: "String should have at most 20 characters", password: "String should have at least 6 characters" },
      message: "Some details need another look.",
    });
    const phone = await toApiError(new Response(JSON.stringify({ message: "Invalid Request", errors: { phone: "phone already exists" } }), { status: 400 }));
    expect(signupErrors(phone).fields).toEqual({ contact_phone: "Another club account already uses this phone number." });
    const odd = await toApiError(new Response(JSON.stringify({ message: "Invalid Request", errors: { tenant: "not allowed" } }), { status: 400 }));
    expect(signupErrors(odd)).toEqual({ fields: {}, message: "Not allowed" });
    expect(signupErrors(new ApiError({ status: 502, message: "Bad gateway" })).message).toBe("Something went wrong on our side. Try again in a minute.");
    expect(signupErrors(new TypeError("fetch failed")).message).toBe("Could not reach MyOtherApp. Check your connection and try again.");
  });
});

describe("the payload", () => {
  it("leaves empty optional fields out, and carries the college and a picked place", () => {
    const values = { ...emptySignup("starter", "monthly"), name: " Circuit ", email: "c@x.in", password: "secret1", confirm_password: "secret1" };
    expect(entries(toFormData(values, null))).toEqual({ name: "Circuit", email: "c@x.in", password: "secret1", requested_plan: "starter", requested_cycle: "monthly" });

    const placed = { ...values, org_id: 2, location_name: "Technopark Phase 1", location_link: "https://www.google.com/maps?q=8.55,76.88" };
    expect(entries(toFormData(placed, null))).toMatchObject({ org_id: "2", location_name: "Technopark Phase 1", location_link: "https://www.google.com/maps?q=8.55,76.88" });
  });

  it("refuses a password that is the email", () => {
    const r = signupSchema.safeParse({ ...emptySignup(), name: "Circuit", email: "abc@x.in", password: "ABC@x.in", confirm_password: "ABC@x.in" });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.message)).toContain("Use something other than the email address");
  });

  it("asks for a plan that is on sale, else Free", () => {
    const catalog = catalogSchema.parse(plans);
    expect(resolvePlanKey("growth", catalog)).toBe("growth");
    expect(resolvePlanKey("platinum", catalog)).toBe("free");
    expect(resolvePlanKey("platinum", null)).toBe("platinum");
  });
});
