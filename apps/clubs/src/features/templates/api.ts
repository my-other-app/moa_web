import { api } from "@moa/app-kit";

import {
  certificateTemplateListSchema,
  ticketTemplateListSchema,
  type CertificateForm,
  type TicketForm,
} from "./schemas";

type Kind = "ticket" | "certificate";

const BASE: Record<Kind, string> = {
  ticket: "/api/v1/ticket-templates",
  certificate: "/api/v1/certificate-templates",
};

/**
 * Both endpoints are multipart with the design itself carried as a JSON string
 * in `config`, alongside the image uploads.
 *
 * Image files are only appended when the user picked a new one. Sending an
 * empty field would be read as "clear this image", silently wiping a logo on
 * an edit that never touched it.
 */
function toFormData(
  values: TicketForm | CertificateForm,
  config: Record<string, unknown>
): FormData {
  const fd = new FormData();
  fd.append("name", values.name);
  fd.append("is_default", String(values.is_default ?? false));
  fd.append("config", JSON.stringify(config));

  const files: Array<[string, File | undefined]> = [
    ["logo", values.logoFile],
    ["secondary_logo", values.secondaryLogoFile],
    ["background_image", values.backgroundFile],
    ["signature_1", (values as CertificateForm).signature1File],
    ["signature_2", (values as CertificateForm).signature2File],
  ];
  for (const [field, file] of files) {
    if (file) fd.append(field, file);
  }
  return fd;
}

export async function fetchTemplates(kind: Kind) {
  const raw = await api.get<unknown>(`${BASE[kind]}/list`);
  return kind === "ticket"
    ? ticketTemplateListSchema.parse(raw)
    : certificateTemplateListSchema.parse(raw);
}

export async function createTemplate(
  kind: Kind,
  values: TicketForm | CertificateForm,
  config: Record<string, unknown>
) {
  await api.post<unknown>(`${BASE[kind]}/create`, toFormData(values, config));
}

export async function updateTemplate(
  kind: Kind,
  templateId: number,
  values: TicketForm | CertificateForm,
  config: Record<string, unknown>
) {
  await api.put<unknown>(`${BASE[kind]}/${templateId}`, toFormData(values, config));
}

export async function deleteTemplate(kind: Kind, templateId: number) {
  await api.del<void>(`${BASE[kind]}/${templateId}`);
}
