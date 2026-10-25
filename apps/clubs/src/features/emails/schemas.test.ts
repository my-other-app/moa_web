import { describe, expect, it } from "vitest";

import {
  BLOCK_KINDS,
  EMAIL_TEXT_MAX,
  audienceSummary,
  blankTemplate,
  emailDesignSchema,
  emailTemplateFieldsSchema,
  emailTemplateSchema,
  fieldsOf,
  newBlock,
  triggerSummary,
} from "./schemas";

describe("the email contract", () => {
  it("reads a block as long as the server saved it, so one long block cannot blank the screens", () => {
    // The server takes 4,000 characters (app/core/mail/schema.py, Text); this
    // build read at most 2,000, and the template, the event's Emails tab and
    // the library all failed to load after one long paragraph was saved.
    expect(EMAIL_TEXT_MAX).toBe(4000);
    const long = "word ".repeat(900); // 4,500 characters
    const saved = {
      ...blankTemplate(),
      id: "t1", clubId: 5, eventId: 9, stage: "CUSTOM", version: 2, sourceId: null,
      createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z",
      design: { blocks: [
        { kind: "paragraph", id: "p1", text: long },
        { kind: "list", id: "l1", items: [long] },
        { kind: "details", id: "d1", rows: [{ label: "Note", value: long }] },
      ] },
    };
    const parsed = emailTemplateSchema.parse(saved);
    expect(parsed.design.blocks[0]).toMatchObject({ kind: "paragraph", text: long });
  });

  it("makes a block of every kind the designer can add, each with its own id", () => {
    const blocks = BLOCK_KINDS.map(newBlock);
    expect(new Set(blocks.map((b) => b.id)).size).toBe(blocks.length);
    expect(blocks.map((b) => b.kind)).toEqual(BLOCK_KINDS);
    // Round-trips through the schema the server validates with.
    expect(emailDesignSchema.parse({ blocks }).blocks).toHaveLength(BLOCK_KINDS.length);
  });

  it("fills defaults the way the server does, so a saved design reads back the same", () => {
    const d = emailDesignSchema.parse({ blocks: [{ kind: "paragraph", id: "p1", text: "Hi" }] });
    expect(d.theme.accent).toBe("brand");
    expect(d.theme.radius).toBe(12);
    expect(d.blocks[0]).toMatchObject({ style: { align: "left", paddingTop: 0, paddingBottom: 8 } });
  });

  it("refuses a colour that is not six hex digits", () => {
    expect(() => emailDesignSchema.parse({ theme: { background: "red" }, blocks: [] })).toThrow();
  });

  it("keeps only the editable fields of a template for a save", () => {
    const fields = fieldsOf({ ...blankTemplate(), id: "x", version: 3 } as never);
    expect(Object.keys(fields).sort()).toEqual(["attachments", "audience", "channels", "design", "enabled", "name", "subject", "trigger"]);
    expect(emailTemplateFieldsSchema.parse(fields)).toBeTruthy();
  });

  it("says when and to whom in words", () => {
    expect(triggerSummary({ mode: "MANUAL" })).toBe("By hand");
    expect(triggerSummary({ mode: "ON_TICKETS" })).toBe("With the ticket");
    expect(triggerSummary({ mode: "BEFORE_START", minutes: 1440 })).toBe("1 day before the start");
    expect(triggerSummary({ mode: "BEFORE_START", minutes: 90 })).toBe("90 minutes before the start");
    expect(triggerSummary({ mode: "AFTER_END", minutes: 120 })).toBe("2 hours after the end");
    expect(audienceSummary({ who: "CHECKED_IN", roles: [] })).toBe("Checked in");
    expect(audienceSummary({ who: "ALL", roles: ["speaker", "staff"] })).toBe("Everyone registered · speaker, staff");
  });
});
