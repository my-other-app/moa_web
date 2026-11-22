import { api } from "@moa/app-kit";
import { z } from "zod";

import { printerSchema, printQueueSchema, printRequestSchema } from "./schemas";

const base = (eventId: number) => `/api/v1/events/${eventId}/idcards`;

export async function fetchPrinters(eventId: number) {
  return z.array(printerSchema).parse(await api.get<unknown>(`${base(eventId)}/printers`));
}

/** Sends one guest's card to the print station. `override` is a reprint past the event's rule, confirmed by an organiser. */
export async function createPrintRequest(eventId: number, body: { registration_id: string; printer_id?: string | null; override?: boolean }) {
  return printRequestSchema.parse(await api.post<unknown>(`${base(eventId)}/print-requests`, { printer_id: null, override: false, ...body }));
}

export type QueueFilter = "open" | "done" | "failed" | "all";
export async function fetchPrintRequests(eventId: number, status: QueueFilter = "all", limit = 50) {
  return printQueueSchema.parse(await api.get<unknown>(`${base(eventId)}/print-requests`, { query: { status, limit } }));
}
export async function retryPrintRequest(eventId: number, id: string) {
  return printRequestSchema.parse(await api.post<unknown>(`${base(eventId)}/print-requests/${encodeURIComponent(id)}/retry`, {}));
}
export async function cancelPrintRequest(eventId: number, id: string) {
  return printRequestSchema.parse(await api.post<unknown>(`${base(eventId)}/print-requests/${encodeURIComponent(id)}/cancel`, {}));
}
