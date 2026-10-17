import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";

/**
 * The way in for a club with no account: the sign-in page points at the
 * application, the proxy lets a visitor without a session reach it, and the
 * pricing page's ?plan=&cycle= is what the application offers.
 */

const redirect = vi.fn((to: string) => {
  throw new Error(`redirect ${to}`);
});
const session = { current: null as null | { user_type: string } };

vi.mock("next/navigation", () => ({
  redirect: (to: string) => redirect(to),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/login",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@moa/auth/server", () => ({ getSessionQuietly: vi.fn(async () => session.current) }));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- a plain stand-in for the optimised image
  default: ({ priority: _p, unoptimized: _u, ...props }: Record<string, unknown>) => <img {...(props as React.ImgHTMLAttributes<HTMLImageElement>)} />,
}));
// The flow has its own tests; here it only has to receive what the URL asked for.
vi.mock("@/features/signup", () => ({
  SignupFlow: (props: { initialPlan: string; initialCycle: string }) => (
    <p data-testid="flow">
      {props.initialPlan} {props.initialCycle}
    </p>
  ),
}));

const { render } = await import("@/test/render");
const { default: LoginPage } = await import("../login/page");
const { default: SignupPage } = await import("./page");
const { config } = await import("@/proxy");

describe("the way in", () => {
  it("offers a new club the application from the sign-in page", async () => {
    session.current = null;
    render(await LoginPage());
    expect(screen.getByText(/New club\?/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Apply to join" })).toHaveAttribute("href", "/signup");
  });

  it("lets a visitor without a session reach /signup, and still guards the dashboard", () => {
    // Next reads the matcher as a path pattern; anchored, it is this regular expression.
    const guarded = (path: string) => new RegExp(`^${config.matcher[0]}$`).test(path);
    expect(guarded("/signup")).toBe(false);
    expect(guarded("/login")).toBe(false);
    expect(guarded("/billing")).toBe(true);
    expect(guarded("/")).toBe(true);
  });

  it("opens the application with the plan the pricing page asked for", async () => {
    session.current = null;
    render(await SignupPage({ searchParams: Promise.resolve({ plan: "growth", cycle: "yearly" }) }));
    expect(screen.getByTestId("flow")).toHaveTextContent("growth yearly");
  });

  it("reads a missing or malformed plan as Free, monthly", async () => {
    session.current = null;
    render(await SignupPage({ searchParams: Promise.resolve({ plan: "<script>", cycle: ["weekly"] }) }));
    expect(screen.getByTestId("flow")).toHaveTextContent("free monthly");
  });

  it("sends a club that is already signed in to its dashboard", async () => {
    session.current = { user_type: "club" };
    await expect(SignupPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect /");
  });
});
