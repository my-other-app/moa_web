"use client";

import { QrCodeIcon } from "lucide-react";

import type { TicketConfig } from "../schemas";

/**
 * Approximates templates/pdf/events/ticket.html.
 *
 * It is a preview, not a renderer: wkhtmltopdf produces the real artefact, and
 * fonts and spacing will differ slightly. It exists so a club can judge colour
 * and content choices without generating a PDF for every tweak, and it is
 * labelled as approximate so nobody treats it as proof.
 */
export function TicketPreview({
  config,
  logoUrl,
  backgroundUrl,
  clubName = "Your Club",
}: {
  config: TicketConfig;
  logoUrl?: string | null;
  backgroundUrl?: string | null;
  clubName?: string;
}) {
  const border =
    config.border_style === "none"
      ? undefined
      : `2px ${config.border_style} ${config.border_color}`;

  return (
    <div
      className="w-full overflow-hidden rounded-xl p-1 transition-colors duration-300"
      style={{ backgroundColor: config.accent_color }}
    >
      <div
        className="relative rounded-lg px-5 py-6 transition-colors duration-300"
        style={{
          backgroundColor: config.bg_color,
          color: config.text_color,
          fontFamily: `"${config.font}", ui-sans-serif, system-ui, sans-serif`,
          border,
          backgroundImage: backgroundUrl ? `url(${backgroundUrl})` : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {config.custom_header_text ? (
              <p
                className="text-[10px] tracking-[0.2em] uppercase"
                style={{ color: config.secondary_text_color }}
              >
                {config.custom_header_text}
              </p>
            ) : null}
            {config.organizer_subtitle ? (
              <p className="text-[11px]" style={{ color: config.secondary_text_color }}>
                {clubName} {config.organizer_subtitle}
              </p>
            ) : null}
            <h3 className="mt-1 truncate text-xl font-bold">Sample Event Name</h3>
            <p className="text-xs" style={{ color: config.secondary_text_color }}>
              12 Mar 2026 · 6:00 PM · Main Auditorium
            </p>
          </div>

          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="size-10 shrink-0 object-contain" />
          ) : null}
        </div>

        <div
          className="mt-4 inline-block rounded px-2 py-0.5 text-[10px] font-bold tracking-wider"
          style={{ backgroundColor: config.accent_color, color: config.bg_color }}
        >
          {config.ticket_type_label}
        </div>

        <div className="mt-5 flex items-end justify-between gap-4">
          <div className="space-y-1 text-xs">
            <p style={{ color: config.secondary_text_color }}>Attendee</p>
            <p className="font-medium">A. Student</p>
            {config.show_prizes ? (
              <p style={{ color: config.secondary_text_color }}>Prize pool ₹10,000</p>
            ) : null}
            {config.show_guidelines_link ? (
              <p className="underline" style={{ color: config.accent_color }}>
                Event guidelines
              </p>
            ) : null}
          </div>

          <div
            className="grid size-16 shrink-0 place-items-center rounded"
            style={{ backgroundColor: config.text_color, color: config.bg_color }}
          >
            <QrCodeIcon className="size-12" />
          </div>
        </div>

        {config.custom_footer_text ? (
          <p
            className="mt-4 border-t pt-3 text-center text-[10px]"
            style={{
              color: config.secondary_text_color,
              borderColor: config.secondary_text_color + "40",
            }}
          >
            {config.custom_footer_text}
          </p>
        ) : null}
      </div>
    </div>
  );
}
