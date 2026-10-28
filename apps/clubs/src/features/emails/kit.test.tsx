import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";

const { render } = await import("@/test/render");
const { TemplateField } = await import("./components/kit");
const { EMAIL_TEXT_MAX } = await import("./schemas");

/**
 * A block's text is held to the server's limit while it is typed, so a block
 * the server would refuse is never sent -- and one that came in longer (an
 * AI draft, a paste) says so under the field.
 */
describe("a block's text field", () => {
  it("stops at the server's 4,000 characters", () => {
    render(<TemplateField id="t" label="Text" value="Hi" onChange={vi.fn()} tokens={[]} samples={{}} />);
    expect(screen.getByLabelText("Text")).toHaveAttribute("maxLength", String(EMAIL_TEXT_MAX));
  });

  it("says when the text is over it", () => {
    const onChange = vi.fn();
    render(<TemplateField id="t" label="Text" value={"x".repeat(EMAIL_TEXT_MAX + 5)} onChange={onChange} tokens={[]} samples={{}} />);
    expect(screen.getByText(/Keep this under 4,000 characters: it is 4,005/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Text"), { target: { value: "short" } });
    expect(onChange).toHaveBeenCalledWith("short");
  });

  it("puts no limit on a one-line field unless it is given one", () => {
    render(<TemplateField id="s" label="Subject" value="Hi" onChange={vi.fn()} tokens={[]} samples={{}} single />);
    expect(screen.getByLabelText("Subject")).not.toHaveAttribute("maxLength");
  });
});

/**
 * The registration review emails' tokens (the contract's section 5.3): the
 * client's check takes them, and the token menu offers each one only to the
 * stages it belongs to, under "Registration review".
 */
const { problemsOf } = await import("./components/kit");
const { EMAIL_TOKEN_KEYS, REQUEST_TOKENS, tokensForStage } = await import("./schemas");

describe("the registration review tokens", () => {
  it("are accepted by the client's check", () => {
    for (const key of ["status_url", "cancel_url", "pay_url", "pay_amount", "pay_by", "decline_note", "event_url"]) {
      expect(EMAIL_TOKEN_KEYS.has(key)).toBe(true);
      expect(problemsOf(`See {{${key}}}`)).toEqual([]);
    }
    expect(problemsOf("{% if decline_note %}A note from {{org_name}}: “{{decline_note}}”{% endif %}")).toEqual([]);
    expect(problemsOf("[Cancel my registration]({{cancel_url}})")).toEqual([]);
    // A mistyped one is still caught.
    expect(problemsOf("{{status_link}}").length).toBeGreaterThan(0);
  });

  const server = [
    { key: "first_name", group: "Guest", label: "First name", sample: "Asha" },
    { key: "status_url", group: "Registration review", label: "Link to their registration", sample: "https://x/requests/1", stages: ["REQUEST_RECEIVED", "REQUEST_APPROVED_PAY", "REQUEST_DECLINED", "REQUEST_LAPSED", "REQUEST_UNANSWERED"] },
    { key: "pay_url", group: "Registration review", label: "Link to pay", sample: "https://x/claim/1", stages: ["request_approved_pay"] },
    { key: "decline_note", group: "Registration review", label: "Your note", sample: "Full", stages: ["DECLINED"] },
  ];

  it("go only to the stages they belong to, as the server names them", () => {
    const keys = (stage: string) => tokensForStage(server, stage).map((t) => t.key);
    expect(keys("REQUEST_RECEIVED")).toEqual(["first_name", "status_url", "cancel_url", "event_url"]);
    expect(keys("REQUEST_APPROVED_PAY")).toContain("pay_url");
    expect(keys("REQUEST_DECLINED")).toEqual(expect.arrayContaining(["first_name", "status_url", "decline_note"]));
    expect(keys("REQUEST_DECLINED")).not.toContain("pay_url");
    // The ticket email for confirmed people takes the ticket's tokens, none of these.
    expect(keys("REQUEST_APPROVED")).toEqual(["first_name"]);
    // A journey email never offers them.
    expect(keys("INVITE")).toEqual(["first_name"]);
    expect(keys("REMINDER")).toEqual(["first_name"]);
    expect(tokensForStage(server, "REQUEST_DECLINED").filter((t) => t.key !== "first_name").every((t) => t.group === "Registration review")).toBe(true);
  });

  it("come from the contract when the server sends none, or sends them without stages", () => {
    const old = [{ key: "first_name", group: "Guest", label: "First name", sample: "Asha" }];
    expect(tokensForStage(old, "REQUEST_APPROVED_PAY").map((t) => t.key)).toEqual(["first_name", "status_url", "cancel_url", "pay_url", "pay_amount", "pay_by", "event_url"]);
    expect(tokensForStage(old, "INVITE").map((t) => t.key)).toEqual(["first_name"]);
    const noStages = [...old, { key: "decline_note", group: "Other", label: "Your note", sample: "Full" }];
    expect(tokensForStage(noStages, "REQUEST_DECLINED").find((t) => t.key === "decline_note")?.group).toBe("Registration review");
    expect(tokensForStage(noStages, "REQUEST_LAPSED").map((t) => t.key)).not.toContain("decline_note");
    expect(tokensForStage(noStages, "POST_EVENT").map((t) => t.key)).toEqual(["first_name"]);
    expect(REQUEST_TOKENS.map((t) => t.key)).toEqual(["status_url", "cancel_url", "pay_url", "pay_amount", "pay_by", "decline_note", "event_url"]);
  });
});
