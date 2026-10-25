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
