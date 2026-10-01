"use client";

import { QrCodeIcon } from "lucide-react";

import type { CertificateConfig } from "../schemas";

/** Approximates templates/pdf/events/certificate.html. See TicketPreview. */
export function CertificatePreview({
  config,
  logoUrl,
  secondaryLogoUrl,
  backgroundUrl,
  signature1Url,
  signature2Url,
  clubName = "Your Club",
}: {
  config: CertificateConfig;
  logoUrl?: string | null;
  secondaryLogoUrl?: string | null;
  backgroundUrl?: string | null;
  signature1Url?: string | null;
  signature2Url?: string | null;
  clubName?: string;
}) {
  const border =
    config.border_style === "none"
      ? undefined
      : `3px ${config.border_style} ${config.border_color}`;

  const titleFont = config.title_font ?? config.font;
  const isPortrait = config.orientation === "portrait";

  return (
    <div
      className="mx-auto w-full overflow-hidden rounded-lg transition-all duration-300"
      style={{
        aspectRatio: isPortrait ? "1 / 1.414" : "1.414 / 1",
        backgroundColor: config.bg_color,
        color: config.text_color,
        fontFamily: `"${config.font}", ui-sans-serif, system-ui, sans-serif`,
        border,
        backgroundImage: backgroundUrl ? `url(${backgroundUrl})` : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="flex h-full flex-col items-center justify-between p-6 text-center">
        <div className="flex w-full items-center justify-between">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="size-10 object-contain" />
          ) : (
            <span />
          )}
          {secondaryLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={secondaryLogoUrl} alt="" className="size-10 object-contain" />
          ) : (
            <span />
          )}
        </div>

        <div className="space-y-2">
          <h3
            className="text-2xl font-bold tracking-wide text-balance"
            style={{
              fontFamily: `"${titleFont}", serif`,
              color: config.accent_color,
            }}
          >
            {config.certificate_title}
          </h3>
          <p className="text-[11px]" style={{ color: config.secondary_text_color }}>
            This is to certify that
          </p>
          <p className="text-xl font-semibold">A. Student</p>
          <p
            className="mx-auto max-w-sm text-[11px] text-pretty"
            style={{ color: config.secondary_text_color }}
          >
            {config.custom_body_text ||
              `has participated in Sample Event, organised by ${clubName}.`}
          </p>
        </div>

        <div className="flex w-full items-end justify-between gap-4">
          <div className="min-w-0 text-left text-[10px]">
            {signature1Url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={signature1Url} alt="" className="mb-1 h-6 object-contain" />
            ) : null}
            {config.signature_1_name ? (
              <>
                <p className="border-t pt-1 font-medium" style={{ borderColor: config.secondary_text_color }}>
                  {config.signature_1_name}
                </p>
                <p style={{ color: config.secondary_text_color }}>
                  {config.signature_1_title}
                </p>
              </>
            ) : null}
          </div>

          {config.show_qr_code ? (
            <div
              className="grid size-12 shrink-0 place-items-center rounded"
              style={{ backgroundColor: config.text_color, color: config.bg_color }}
            >
              <QrCodeIcon className="size-9" />
            </div>
          ) : null}

          <div className="min-w-0 text-right text-[10px]">
            {signature2Url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={signature2Url} alt="" className="mb-1 ml-auto h-6 object-contain" />
            ) : null}
            {config.signature_2_name ? (
              <>
                <p className="border-t pt-1 font-medium" style={{ borderColor: config.secondary_text_color }}>
                  {config.signature_2_name}
                </p>
                <p style={{ color: config.secondary_text_color }}>
                  {config.signature_2_title}
                </p>
              </>
            ) : null}
          </div>
        </div>

        <div className="w-full space-y-0.5">
          {config.custom_footer_text ? (
            <p className="text-[10px]" style={{ color: config.secondary_text_color }}>
              {config.custom_footer_text}
            </p>
          ) : null}
          {config.show_certificate_id ? (
            <p className="text-[9px]" style={{ color: config.secondary_text_color }}>
              ID: MOA-XXXXXXX-XXXXX
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
