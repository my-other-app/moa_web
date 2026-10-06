import { describe, expect, it } from "vitest";

import {
  certificateConfigSchema,
  defaultCertificateConfig,
  defaultTicketConfig,
  ticketConfigSchema,
} from "./schemas";

/**
 * The designer's defaults must match the backend's TicketTemplateConfig and
 * CertificateTemplateConfig exactly. If they drift, a template created here
 * renders differently from one created by any other client, and the difference
 * only shows up in a generated PDF — far from the code that caused it.
 *
 * These values are transcribed from app/api/{ticket,certificate}_templates/
 * schemas.py.
 */
describe("config defaults match the backend", () => {
  it("ticket", () => {
    expect(defaultTicketConfig()).toEqual({
      accent_color: "#1db9a0",
      bg_color: "#121212",
      text_color: "#ffffff",
      secondary_text_color: "#aaaaaa",
      border_color: "#1db9a0",
      font: "Inter",
      ticket_type_label: "GENERAL",
      border_style: "none",
      show_prizes: true,
      show_guidelines_link: true,
      /*
       * Layer mode, empty by default. Both renderers switch on `layers` being
       * non-empty, so this staying empty is what guarantees every existing
       * template renders exactly as it did -- it is the assertion, not an
       * afterthought to keep the test passing.
       */
      layers: [],
      canvas: { width: 0, height: 0 },
    });
  });

  it("certificate", () => {
    const config = defaultCertificateConfig();
    expect(config.accent_color).toBe("#1db9a0");
    expect(config.bg_color).toBe("#121212");
    expect(config.certificate_title).toBe("Certificate of Participation");
    expect(config.orientation).toBe("landscape");
    expect(config.border_style).toBe("none");
    expect(config.show_qr_code).toBe(true);
    expect(config.show_certificate_id).toBe(true);
    expect(config.date_format).toBe("dd MMM yyyy");
    expect(config.font).toBe("Inter");
    // title_font intentionally has no default; the renderer falls back to font.
    expect(config.title_font).toBeUndefined();
    // Certificates carry layers too, and default to the built-in layout.
    expect(config.layers).toEqual([]);
    expect(config.canvas).toEqual({ width: 0, height: 0 });
  });
});

describe("config validation", () => {
  it("rejects a colour that is not 6-digit hex", () => {
    expect(ticketConfigSchema.safeParse({ accent_color: "red" }).success).toBe(false);
    expect(ticketConfigSchema.safeParse({ accent_color: "#fff" }).success).toBe(false);
    expect(ticketConfigSchema.safeParse({ accent_color: "#1DB9A0" }).success).toBe(true);
  });

  it("rejects an option the renderer does not understand", () => {
    expect(ticketConfigSchema.safeParse({ border_style: "groovy" }).success).toBe(false);
    expect(certificateConfigSchema.safeParse({ orientation: "diagonal" }).success).toBe(false);
  });

  it("fills in defaults for a partially-saved config", () => {
    // A template saved by an older client may be missing keys added since.
    const parsed = ticketConfigSchema.parse({ accent_color: "#ff0000" });
    expect(parsed.accent_color).toBe("#ff0000");
    expect(parsed.bg_color).toBe("#121212");
    expect(parsed.show_prizes).toBe(true);
  });

  it("does not silently accept an unknown colour key as a colour", () => {
    // Extra keys are stripped by Zod rather than passed through to the
    // renderer, which would ignore them anyway.
    const parsed = ticketConfigSchema.parse({ nonsense_color: "#ffffff" });
    expect("nonsense_color" in parsed).toBe(false);
  });
});
