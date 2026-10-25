import { z } from "zod";

export const JOB_STATES = ["dead", "failing", "stuck"] as const;
export type JobState = (typeof JOB_STATES)[number];

export const STATE_WORDS: Record<JobState, string> = { dead: "Failed", failing: "Retrying", stuck: "Stuck" };

/** GET /admin/jobs (app/api/health.py): the queue per name, and the runners. */
export const queueSchema = z.object({
  queues: z
    .array(
      z.object({
        name: z.string(),
        due: z.number().catch(0),
        scheduled: z.number().catch(0),
        running: z.number().catch(0),
        abandoned: z.number().catch(0),
        oldest_due_seconds: z.number().nullish(),
        dead: z.number().catch(0),
      })
    )
    .catch([]),
  workers: z
    .array(
      z.object({
        id: z.string(),
        kind: z.string().nullish(),
        host: z.string().nullish(),
        running: z.number().nullish(),
        handled: z.number().nullish(),
        failed: z.number().nullish(),
        beat_at: z.string().nullish(),
      })
    )
    .catch([]),
  mode: z.string().nullish(),
});
export type JobQueue = z.infer<typeof queueSchema>;

export const jobSchema = z.object({
  id: z.number(),
  name: z.string(),
  state: z.string(),
  attempts: z.number().catch(0),
  max_attempts: z.number().catch(0),
  error: z.string().nullish(),
  run_at: z.string().nullish(),
  last_run_at: z.string().nullish(),
  created_at: z.string().nullish(),
  locked_by: z.string().nullish(),
  locked_until: z.string().nullish(),
  priority: z.number().nullish(),
});
export type Job = z.infer<typeof jobSchema>;

export const jobPageSchema = z.object({
  items: z.array(jobSchema),
  total: z.number().catch(0),
  counts: z.object({ dead: z.number().catch(0), failing: z.number().catch(0), stuck: z.number().catch(0) }).catch({ dead: 0, failing: 0, stuck: 0 }),
  state: z.string().catch("dead"),
  stuck_after_minutes: z.number().catch(10),
  offset: z.number().catch(0),
  limit: z.number().catch(50),
});
export type JobPage = z.infer<typeof jobPageSchema>;
