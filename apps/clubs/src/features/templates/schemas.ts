import { imageFieldSchema } from "@moa/app-kit";
import { z } from "zod";

/** Mirrors the backend's enumerated string options. */
export const BORDER_STYLES = ["none", "solid", "dashed", "double"] as const;
export const TICKET_TYPES = [
  "GENERAL",
  "VIP",
  "EARLY BIRD",
  "PREMIUM",
  "STUDENT",
  "FREE",
] as const;
export const ORIENTATIONS = ["landscape", "portrait"] as const;
export const DATE_FORMATS = ["dd MMM yyyy", "MMMM dd yyyy", "dd/MM/yyyy"] as const;

/** Google Fonts the PDF renderer can resolve. */
export const FONTS = [
  "Inter",
  "Roboto",
  "Open Sans",
  "Lato",
  "Montserrat",
  "Poppins",
  "Playfair Display",
  "Merriweather",
] as const;

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex colour, e.g. #1db9a0");

/**
 * Defaults are copied from the backend's TicketTemplateConfig /
 * CertificateTemplateConfig so a template created here renders identically to
 * one created by any other client.
 *
 * The *_url fields are deliberately absent: the backend populates them from
 * the uploaded files and overwrites whatever is sent, so exposing them would
 * imply an edit that does not take.
 */
export const ticketConfigSchema = z.object({
  accent_color: hexColor.default("#1db9a0"),
  bg_color: hexColor.default("#121212"),
  text_color: hexColor.default("#ffffff"),
  secondary_text_color: hexColor.default("#aaaaaa"),
  border_color: hexColor.default("#1db9a0"),
  font: z.enum(FONTS).default("Inter"),
  ticket_type_label: z.enum(TICKET_TYPES).default("GENERAL"),
  border_style: z.enum(BORDER_STYLES).default("none"),
  show_prizes: z.boolean().default(true),
  show_guidelines_link: z.boolean().default(true),
  custom_header_text: z.string().trim().max(120).optional(),
  organizer_subtitle: z.string().trim().max(120).optional(),
  custom_footer_text: z.string().trim().max(200).optional(),
});

export const certificateConfigSchema = z.object({
  accent_color: hexColor.default("#1db9a0"),
  bg_color: hexColor.default("#121212"),
  text_color: hexColor.default("#ffffff"),
  secondary_text_color: hexColor.default("#aaaaaa"),
  border_color: hexColor.default("#1db9a0"),
  font: z.enum(FONTS).default("Inter"),
  title_font: z.enum(FONTS).optional(),
  certificate_title: z.string().trim().min(1).max(120).default("Certificate of Participation"),
  custom_body_text: z.string().trim().max(600).optional(),
  custom_footer_text: z.string().trim().max(200).optional(),
  signature_1_name: z.string().trim().max(100).optional(),
  signature_1_title: z.string().trim().max(100).optional(),
  signature_2_name: z.string().trim().max(100).optional(),
  signature_2_title: z.string().trim().max(100).optional(),
  orientation: z.enum(ORIENTATIONS).default("landscape"),
  border_style: z.enum(BORDER_STYLES).default("none"),
  show_qr_code: z.boolean().default(true),
  show_certificate_id: z.boolean().default(true),
  date_format: z.enum(DATE_FORMATS).default("dd MMM yyyy"),
});

export const ticketFormSchema = z.object({
  name: z.string().trim().min(2, "Name this template").max(100),
  is_default: z.boolean().default(false),
  config: ticketConfigSchema,
  logoFile: z.instanceof(File).optional(),
  secondaryLogoFile: z.instanceof(File).optional(),
  backgroundFile: z.instanceof(File).optional(),
});

export const certificateFormSchema = z.object({
  name: z.string().trim().min(2, "Name this template").max(100),
  is_default: z.boolean().default(false),
  config: certificateConfigSchema,
  logoFile: z.instanceof(File).optional(),
  secondaryLogoFile: z.instanceof(File).optional(),
  backgroundFile: z.instanceof(File).optional(),
  signature1File: z.instanceof(File).optional(),
  signature2File: z.instanceof(File).optional(),
});

const templateBase = {
  id: z.coerce.number(),
  name: z.string(),
  is_default: z.boolean().default(false),
  config: z.record(z.unknown()).default({}),
  logo: imageFieldSchema,
  secondary_logo: imageFieldSchema,
  background_image: imageFieldSchema,
};

export const ticketTemplateSchema = z.object(templateBase);
export const certificateTemplateSchema = z.object({
  ...templateBase,
  signature_1: imageFieldSchema,
  signature_2: imageFieldSchema,
});

const asArray = <T extends z.ZodTypeAny>(item: T) =>
  z
    .union([z.array(item), z.object({ items: z.array(item) })])
    .transform((v) => (Array.isArray(v) ? v : v.items));

export const ticketTemplateListSchema = asArray(ticketTemplateSchema);
export const certificateTemplateListSchema = asArray(certificateTemplateSchema);

export type TicketConfig = z.infer<typeof ticketConfigSchema>;
export type CertificateConfig = z.infer<typeof certificateConfigSchema>;
export type TicketForm = z.input<typeof ticketFormSchema>;
export type CertificateForm = z.input<typeof certificateFormSchema>;
export type TicketTemplate = z.infer<typeof ticketTemplateSchema>;
export type CertificateTemplate = z.infer<typeof certificateTemplateSchema>;

export const defaultTicketConfig = (): TicketConfig => ticketConfigSchema.parse({});
export const defaultCertificateConfig = (): CertificateConfig =>
  certificateConfigSchema.parse({});
