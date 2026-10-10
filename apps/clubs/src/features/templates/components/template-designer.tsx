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
import { ImageField } from "./design-controls";
import { ColourTab, ContentTab, LayoutTab } from "./config-controls";
import { CertificatePreview } from "./certificate-preview";
import { TicketPreview } from "./ticket-preview";
import { LayerEditor } from "./layer-editor";

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
            <TabsTrigger value="artwork">Your artwork</TabsTrigger>
          </TabsList>

          <ColourTab kind={kind} c={c} set={set} />

          <ContentTab kind={kind} c={c} set={set} />

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

          <LayoutTab kind={kind} c={c} set={set} />
                  <TabsContent value="artwork">
            <Card>
              <CardContent>
                {/*
                 * The other tabs restyle the built-in layout. This one is for
                 * a club that already has a design: place the values on it.
                 * A template with no layers still renders the built-in
                 * layout, so this is additive rather than a mode switch.
                 */}
                <LayerEditor
                  kind={kind}
                  artworkUrl={backgroundPreview}
                  canvas={c.canvas}
                  layers={c.layers}
                  onLayersChange={(layers) => set("layers", layers)}
                  onCanvasChange={(canvas) => set("canvas", canvas)}
                  onPickArtwork={(file) =>
                    setFiles((f) => ({ ...f, backgroundFile: file }))
                  }
                  onRemoveArtwork={() =>
                    setFiles((f) => ({ ...f, backgroundFile: undefined }))
                  }
                />
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
