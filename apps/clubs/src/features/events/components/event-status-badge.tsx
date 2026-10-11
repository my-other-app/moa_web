import { StatusBadge, type StatusTone } from "@moa/ui";

import type { EventLifecycle } from "../schemas";

const TONE: Record<EventLifecycle, StatusTone> = {
  draft: "warning",
  published: "info",
  live: "success",
  closed: "default",
  archived: "default",
};

const LABEL: Record<EventLifecycle, string> = {
  draft: "Draft",
  published: "Published",
  live: "Live",
  closed: "Closed",
  archived: "Archived",
};

/** Where the event is on its status clock, as one word in the right colour. */
export function EventStatusBadge({ status, className }: { status: EventLifecycle; className?: string }) {
  return <StatusBadge tone={TONE[status]} label={LABEL[status]} className={className} />;
}
