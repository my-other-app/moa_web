"use client";

import * as React from "react";
import {
  Card,
  CardContent,
  Input,
  Label,
  TabsContent,
  Textarea,
} from "@moa/ui";

import {
  BORDER_STYLES,
  DATE_FORMATS,
  FONTS,
  ORIENTATIONS,
  TICKET_TYPES,
  type CertificateConfig,
  type TicketConfig,
} from "../schemas";
import { ColorField, SelectField, ToggleField } from "./design-controls";

/**
 * The colour, content and layout controls.
 *
 * Lifted out of TemplateDesigner so the event-level designer offers the same
 * controls rather than a second, slowly diverging set of them. Image uploads
 * are deliberately not here: a club template carries its files in the form
 * and uploads them on save, while an event uploads straight to its own
 * design, so the two hosts handle those differently.
 *
 * `c` is the merged config type for the same reason TemplateDesigner uses it:
 * the two configs overlap in most fields and differ in a handful, and `kind`
 * decides which of those are rendered.
 */
export type AnyConfig = TicketConfig & CertificateConfig;

export function ColourTab({
  kind,
  c,
  set,
}: {
  kind: "ticket" | "certificate";
  c: AnyConfig;
  set: (key: string, value: unknown) => void;
}) {
  return (
    <TabsContent value="colors">
      <Card>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <ColorField label="Accent" value={c.accent_color} onChange={(v) => set("accent_color", v)} />
                <ColorField label="Background" value={c.bg_color} onChange={(v) => set("bg_color", v)} />
                <ColorField label="Text" value={c.text_color} onChange={(v) => set("text_color", v)} />
                <ColorField
                  label="Muted text"
                  value={c.secondary_text_color}
                  onChange={(v) => set("secondary_text_color", v)}
                />
                <ColorField label="Border" value={c.border_color} onChange={(v) => set("border_color", v)} />
                <SelectField label="Font" value={c.font} options={FONTS} onChange={(v) => set("font", v)} />
                {kind === "certificate" ? (
                  <SelectField
                    label="Heading font"
                    value={c.title_font ?? c.font}
                    options={FONTS}
                    onChange={(v) => set("title_font", v)}
                    description="Falls back to the body font."
                  />
                ) : null}
              </CardContent>
            </Card>
    </TabsContent>
  );
}

export function ContentTab({
  kind,
  c,
  set,
}: {
  kind: "ticket" | "certificate";
  c: AnyConfig;
  set: (key: string, value: unknown) => void;
}) {
  return (
    <TabsContent value="content">
      <Card>
              <CardContent className="grid gap-4">
                {kind === "ticket" ? (
                  <>
                    <div className="grid gap-2">
                      <Label>Header text</Label>
                      <>
                        <Input
                          value={c.custom_header_text ?? ""}
                          onChange={(e) => set("custom_header_text", e.target.value)}
                          placeholder="ADMIT ONE"
                        />
                      </>
                    </div>
                    <div className="grid gap-2">
                      <Label>Organiser subtitle</Label>
                      <>
                        <Input
                          value={c.organizer_subtitle ?? ""}
                          onChange={(e) => set("organizer_subtitle", e.target.value)}
                          placeholder="presents"
                        />
                      </>
                      <p className="text-muted-foreground text-xs">Appears after your club name.</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid gap-2">
                      <Label>Title</Label>
                      <>
                        <Input
                          value={c.certificate_title}
                          onChange={(e) => set("certificate_title", e.target.value)}
                        />
                      </>
                      
                    </div>
                    <div className="grid gap-2">
                      <Label>Body text</Label>
                      <>
                        <Textarea
                          rows={3}
                          value={c.custom_body_text ?? ""}
                          onChange={(e) => set("custom_body_text", e.target.value)}
                          placeholder="has participated in…"
                        />
                      </>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="grid gap-2">
                        <Label>Signatory 1 name</Label>
                        <>
                          <Input
                            value={c.signature_1_name ?? ""}
                            onChange={(e) => set("signature_1_name", e.target.value)}
                          />
                        </>
                      </div>
                      <div className="grid gap-2">
                        <Label>Signatory 1 title</Label>
                        <>
                          <Input
                            value={c.signature_1_title ?? ""}
                            onChange={(e) => set("signature_1_title", e.target.value)}
                          />
                        </>
                      </div>
                      <div className="grid gap-2">
                        <Label>Signatory 2 name</Label>
                        <>
                          <Input
                            value={c.signature_2_name ?? ""}
                            onChange={(e) => set("signature_2_name", e.target.value)}
                          />
                        </>
                      </div>
                      <div className="grid gap-2">
                        <Label>Signatory 2 title</Label>
                        <>
                          <Input
                            value={c.signature_2_title ?? ""}
                            onChange={(e) => set("signature_2_title", e.target.value)}
                          />
                        </>
                      </div>
                    </div>
                  </>
                )}
                <div className="grid gap-2">
                  <Label>Footer text</Label>
                  <>
                    <Input
                      value={c.custom_footer_text ?? ""}
                      onChange={(e) => set("custom_footer_text", e.target.value)}
                    />
                  </>
                </div>
              </CardContent>
            </Card>
    </TabsContent>
  );
}

export function LayoutTab({
  kind,
  c,
  set,
}: {
  kind: "ticket" | "certificate";
  c: AnyConfig;
  set: (key: string, value: unknown) => void;
}) {
  return (
    <TabsContent value="layout">
      <Card>
              <CardContent className="grid gap-4">
                <SelectField
                  label="Border style"
                  value={c.border_style}
                  options={BORDER_STYLES}
                  onChange={(v) => set("border_style", v)}
                />
                {kind === "ticket" ? (
                  <>
                    <SelectField
                      label="Ticket type label"
                      value={c.ticket_type_label}
                      options={TICKET_TYPES}
                      onChange={(v) => set("ticket_type_label", v)}
                    />
                    <ToggleField
                      label="Show prize info"
                      checked={c.show_prizes}
                      onChange={(v) => set("show_prizes", v)}
                    />
                    <ToggleField
                      label="Show guidelines link"
                      checked={c.show_guidelines_link}
                      onChange={(v) => set("show_guidelines_link", v)}
                    />
                  </>
                ) : (
                  <>
                    <SelectField
                      label="Orientation"
                      value={c.orientation}
                      options={ORIENTATIONS}
                      onChange={(v) => set("orientation", v)}
                    />
                    <SelectField
                      label="Date format"
                      value={c.date_format}
                      options={DATE_FORMATS}
                      onChange={(v) => set("date_format", v)}
                    />
                    <ToggleField
                      label="Show QR code"
                      description="Lets anyone verify the certificate is genuine."
                      checked={c.show_qr_code}
                      onChange={(v) => set("show_qr_code", v)}
                    />
                    <ToggleField
                      label="Show certificate ID"
                      checked={c.show_certificate_id}
                      onChange={(v) => set("show_certificate_id", v)}
                    />
                  </>
                )}
              </CardContent>
            </Card>
    </TabsContent>
  );
}
