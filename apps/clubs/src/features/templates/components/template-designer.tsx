"use client";

import * as React from "react";
import { Loader2Icon, SaveIcon } from "lucide-react";
import { pickImage } from "@moa/app-kit";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  cn,
} from "@moa/ui";
import { pressable } from "@moa/ui/motion";
import { useObjectUrl } from "@moa/ui/hooks";

import {
  BORDER_STYLES,
  DATE_FORMATS,
  FONTS,
  ORIENTATIONS,
  TICKET_TYPES,
  certificateConfigSchema,
  defaultCertificateConfig,
  defaultTicketConfig,
  ticketConfigSchema,
  type CertificateConfig,
  type CertificateTemplate,
  type TicketConfig,
  type TicketTemplate,
} from "../schemas";
import { useSaveTemplate } from "../queries";
import { ColorField, ImageField, SelectField, ToggleField } from "./design-controls";
import { CertificatePreview } from "./certificate-preview";
import { TicketPreview } from "./ticket-preview";

type Kind = "ticket" | "certificate";

interface Files {
  logoFile?: File;
  secondaryLogoFile?: File;
  backgroundFile?: File;
  signature1File?: File;
  signature2File?: File;
}

export function TemplateDesigner({
  kind,
  existing,
  onDone,
}: {
  kind: Kind;
  existing?: TicketTemplate | CertificateTemplate;
  onDone?: () => void;
}) {
  const save = useSaveTemplate(kind, existing?.id);

  const [name, setName] = React.useState(existing?.name ?? "");
  const [nameError, setNameError] = React.useState<string | null>(null);
  const [files, setFiles] = React.useState<Files>({});

  // Existing config is re-parsed through the schema so a template saved by an
  // older client (or with a since-removed key) still opens with valid defaults
  // rather than rendering a half-empty designer.
  const [config, setConfig] = React.useState<TicketConfig | CertificateConfig>(() => {
    const raw = existing?.config ?? {};
    if (kind === "ticket") {
      const parsed = ticketConfigSchema.safeParse(raw);
      return parsed.success ? parsed.data : defaultTicketConfig();
    }
    const parsed = certificateConfigSchema.safeParse(raw);
    return parsed.success ? parsed.data : defaultCertificateConfig();
  });

  const set = <K extends string>(key: K, value: unknown) =>
    setConfig((c) => ({ ...c, [key]: value }) as TicketConfig & CertificateConfig);

  const c = config as TicketConfig & CertificateConfig;

  const logoPreview =
    useObjectUrl(files.logoFile) ?? pickImage(existing?.logo ?? null) ?? null;
  const secondaryPreview =
    useObjectUrl(files.secondaryLogoFile) ??
    pickImage(existing?.secondary_logo ?? null) ??
    null;
  const backgroundPreview =
    useObjectUrl(files.backgroundFile) ??
    pickImage(existing?.background_image ?? null) ??
    null;
  const sig1Preview =
    useObjectUrl(files.signature1File) ??
    pickImage((existing as CertificateTemplate | undefined)?.signature_1 ?? null) ??
    null;
  const sig2Preview =
    useObjectUrl(files.signature2File) ??
    pickImage((existing as CertificateTemplate | undefined)?.signature_2 ?? null) ??
    null;

  async function onSave() {
    if (name.trim().length < 2) {
      setNameError("Name this template");
      return;
    }
    setNameError(null);
    await save.mutateAsync({
      values: {
        name: name.trim(),
        is_default: existing?.is_default ?? false,
        config: config as never,
        ...files,
      },
      config,
    });
    onDone?.();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Template</CardTitle>
            <CardDescription>
              {kind === "ticket"
                ? "Applied to tickets issued for your events."
                : "Applied to certificates issued after an event."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label>Name</Label>
              <>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={kind === "ticket" ? "Main ticket" : "Participation"}
                />
              </>
              {nameError ? (
                <p className="text-destructive animate-in fade-in-0 text-xs">{nameError}</p>
              ) : (
                <p className="text-muted-foreground text-xs">Only you see this name.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="colors">
          <TabsList>
            <TabsTrigger value="colors">Colours</TabsTrigger>
            <TabsTrigger value="content">Content</TabsTrigger>
            <TabsTrigger value="images">Images</TabsTrigger>
            <TabsTrigger value="layout">Layout</TabsTrigger>
          </TabsList>

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

          <TabsContent value="images">
            <Card>
              <CardContent className="grid gap-4">
                <ImageField
                  label="Logo"
                  file={files.logoFile}
                  existingUrl={pickImage(existing?.logo ?? null)}
                  onChange={(f) => setFiles((s) => ({ ...s, logoFile: f }))}
                  hint="PNG with transparency works best."
                />
                <ImageField
                  label="Secondary logo"
                  file={files.secondaryLogoFile}
                  existingUrl={pickImage(existing?.secondary_logo ?? null)}
                  onChange={(f) => setFiles((s) => ({ ...s, secondaryLogoFile: f }))}
                />
                <ImageField
                  label="Background"
                  file={files.backgroundFile}
                  existingUrl={pickImage(existing?.background_image ?? null)}
                  onChange={(f) => setFiles((s) => ({ ...s, backgroundFile: f }))}
                  hint="Keep it low-contrast so text stays readable."
                />
                {kind === "certificate" ? (
                  <>
                    <ImageField
                      label="Signature 1"
                      file={files.signature1File}
                      existingUrl={pickImage(
                        (existing as CertificateTemplate | undefined)?.signature_1 ?? null
                      )}
                      onChange={(f) => setFiles((s) => ({ ...s, signature1File: f }))}
                    />
                    <ImageField
                      label="Signature 2"
                      file={files.signature2File}
                      existingUrl={pickImage(
                        (existing as CertificateTemplate | undefined)?.signature_2 ?? null
                      )}
                      onChange={(f) => setFiles((s) => ({ ...s, signature2File: f }))}
                    />
                  </>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>

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
        </Tabs>
      </div>

      <div className="lg:sticky lg:top-20 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preview</CardTitle>
            <CardDescription>
              {/* Honest about fidelity: the PDF is produced by wkhtmltopdf, so
                  fonts and spacing will differ a little. */}
              An approximation — the final PDF is rendered server-side, so
              spacing and fonts may differ slightly.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {kind === "ticket" ? (
              <TicketPreview
                config={c}
                logoUrl={logoPreview}
                backgroundUrl={backgroundPreview}
              />
            ) : (
              <CertificatePreview
                config={c}
                logoUrl={logoPreview}
                secondaryLogoUrl={secondaryPreview}
                backgroundUrl={backgroundPreview}
                signature1Url={sig1Preview}
                signature2Url={sig2Preview}
              />
            )}

            <Button
              type="button"
              onClick={onSave}
              disabled={save.isPending}
              className={cn("mt-5 w-full", pressable)}
            >
              {save.isPending ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
              {save.isPending
                ? "Saving…"
                : existing
                  ? "Save template"
                  : "Create template"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
