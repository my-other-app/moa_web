import { api } from "@moa/app-kit";

import { jobPageSchema, queueSchema, type JobState } from "./schemas";

export async function fetchJobQueue() {
  return queueSchema.parse(await api.get<unknown>("/api/v1/admin/jobs"));
}

export async function fetchJobs(state: JobState, offset: number, limit: number) {
  return jobPageSchema.parse(await api.get<unknown>("/api/v1/admin/jobs/items", { query: { state, offset, limit } }));
}

export async function retryJob(id: number) {
  await api.post<unknown>(`/api/v1/admin/jobs/${id}/retry`);
}

export async function cancelJob(id: number) {
  await api.post<unknown>(`/api/v1/admin/jobs/${id}/cancel`);
}
