import { api } from "@moa/app-kit";

import { volunteerListSchema, type AddVolunteerInput, type Volunteer } from "./schemas";

export async function fetchVolunteers(eventId: number): Promise<Volunteer[]> {
  const raw = await api.get<unknown>(`/api/v1/events/volunteer/list/${eventId}`);
  return volunteerListSchema.parse(raw);
}

export async function addVolunteer(eventId: number, input: AddVolunteerInput) {
  await api.post<void>("/api/v1/events/volunteer/add", {
    event_id: eventId,
    full_name: input.full_name,
    email_id: input.email_id,
    ...(input.phone ? { phone: input.phone } : {}),
  });
}

/** DELETE with a body — the endpoint identifies the volunteer by email. */
export async function removeVolunteer(eventId: number, emailId: string) {
  await api.del<void>("/api/v1/events/volunteer/remove", {
    event_id: eventId,
    email_id: emailId,
  });
}
