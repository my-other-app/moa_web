import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@moa/api";

/**
 * A club whose application is not approved yet. The Wave-1 API answers its
 * session check, its every call and its refresh with 403 CLUB_NOT_VERIFIED
 * (today's answers 401); the dashboard shows it a screen saying so, in the
 * sign-in form's words, rather than signing it out or failing the page.
 */
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }));
const redirect = vi.hoisted(() =>
  vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  })
);
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  redirect,
}));

const session = vi.hoisted(() => ({ check: vi.fn() }));
vi.mock("@moa/auth/server", () => ({ getSessionWithRole: session.check }));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div data-testid="shell">{children}</div> }));

const logout = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return { ...actual, useLogout: () => ({ mutateAsync: logout, isPending: false }) };
});

const { render } = await import("@/test/render");
const { default: DashboardLayout } = await import("@/app/(dashboard)/layout");
const { AwaitingApproval, useClubNotVerified } = await import("./awaiting-approval");
const { CLUB_UNDER_REVIEW } = await import("@moa/app-kit");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("a club awaiting approval", () => {
  it("is told so by the dashboard, in the sign-in form's words", async () => {
    session.check.mockResolvedValue({ user: null, allowed: false, refusal: "CLUB_NOT_VERIFIED" });
    render(await DashboardLayout({ children: <p>dashboard</p> }));
    expect(screen.getByRole("heading", { name: "Your club is awaiting approval" })).toBeInTheDocument();
    expect(screen.getByText(CLUB_UNDER_REVIEW)).toBeInTheDocument();
    expect(screen.queryByText("dashboard")).toBeNull();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("still sends a dead session to sign in -- today's 401, which names no code", async () => {
    session.check.mockResolvedValue({ user: null, allowed: false, refusal: null });
    await expect(DashboardLayout({ children: <p>dashboard</p> })).rejects.toThrow("NEXT_REDIRECT /login");
  });

  it("lets an approved club in", async () => {
    session.check.mockResolvedValue({ user: { id: 1, username: "yukthi", email: "y@x.in", full_name: "Yukthi", user_type: "club" }, allowed: true, refusal: null });
    render(await DashboardLayout({ children: <p>dashboard</p> }));
    expect(screen.getByTestId("shell")).toHaveTextContent("dashboard");
  });

  it("checks again, or signs out to the sign-in page", async () => {
    render(<AwaitingApproval />);
    fireEvent.click(screen.getByRole("button", { name: /Check again/ }));
    expect(router.refresh).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Sign out/ }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/login"));
    expect(logout).toHaveBeenCalled();
  });

  it("takes over the dashboard when a call comes back CLUB_NOT_VERIFIED mid-session", async () => {
    function Page({ fail }: { fail: ApiError }) {
      const notVerified = useClubNotVerified();
      useQuery({
        queryKey: ["any", fail.errorCode],
        queryFn: async () => {
          throw fail;
        },
      });
      return notVerified ? <AwaitingApproval /> : <p>dashboard</p>;
    }
    const { unmount } = render(<Page fail={new ApiError({ message: "Not Authorized", status: 403, errorCode: "INSUFFICIENT_PERMISSIONS" })} />);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByText("dashboard")).toBeInTheDocument();
    unmount();
    render(<Page fail={new ApiError({ message: "Club is not verified", status: 403, errorCode: "CLUB_NOT_VERIFIED" })} />);
    expect(await screen.findByRole("heading", { name: "Your club is awaiting approval" })).toBeInTheDocument();
  });
});
