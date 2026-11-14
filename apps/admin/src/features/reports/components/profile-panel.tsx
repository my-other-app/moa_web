"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { EyeIcon, EyeOffIcon, Loader2Icon, XIcon } from "lucide-react";
import { ApiError, type ReportedProfile } from "@moa/api";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Notice } from "@moa/ui";

import { REPORTS_KEY, useProfileModeration, type ProfileAction } from "../queries";

/** A link's kind as its owner picked it, in its own spelling. */
const LINK_TYPE: Record<string, string> = {
  linkedin: "LinkedIn",
  github: "GitHub",
  behance: "Behance",
  dribbble: "Dribbble",
  medium: "Medium",
  youtube: "YouTube",
  x: "X",
  instagram: "Instagram",
  website: "Website",
  portfolio: "Portfolio",
  other: "Link",
};

export function linkTypeLabel(type: string): string {
  return LINK_TYPE[type] ?? (type ? type.replace(/_/g, " ") : "Link");
}

/** "@ananya", or "the profile" when the server sent no handle. */
const at = (handle: string) => (handle ? `@${handle}` : "the profile");

function copy(action: ProfileAction, words: string): { title: string; body: string; cta: string; destructive: boolean } {
  const whose = action.handle ? `@${action.handle}'s profile` : "the profile";
  if (action.kind === "unhide") {
    return {
      title: "Unhide this profile?",
      body: `${action.handle ? `@${action.handle}'s profile` : "The profile"}, its vCard and its personal QR code work again for everyone. Its reports stay as they were decided.`,
      cta: "Unhide",
      destructive: false,
    };
  }
  if (action.kind === "link") {
    return {
      title: "Remove this link?",
      body: `${words} comes off ${whose} for everyone. The rest of the profile stays, and its owner can add the link again.`,
      cta: "Remove link",
      destructive: true,
    };
  }
  return {
    title: "Remove this project?",
    body: `“${words}” comes off ${whose} for everyone. The rest of the profile stays, and its owner can add the project again.`,
    cta: "Remove project",
    destructive: true,
  };
}

/**
 * Asking before a profile changes: a link or a project taken off, or a
 * hidden profile shown again. The server's words if it refuses; one already
 * gone (404) reads the list again, so the row stops offering it.
 */
function ProfileActionDialog({ action, words, onClose }: { action: ProfileAction; words: string; onClose: () => void }) {
  const run = useProfileModeration();
  const queryClient = useQueryClient();
  const said = copy(action, words);
  const refused = run.error ? run.error.message || "That did not go through." : null;
  return (
    <Dialog open onOpenChange={(open) => !open && !run.isPending && onClose()}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>{said.title}</DialogTitle>
          <DialogDescription className="[overflow-wrap:anywhere]">{said.body}</DialogDescription>
        </DialogHeader>
        {refused ? <Notice tone="refuse">{refused.replace(/\.$/, "")}. Nothing was changed.</Notice> : null}
        <DialogFooter>
          <Button type="button" variant="secondary" disabled={run.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant={said.destructive ? "destructive" : "primary"}
            disabled={run.isPending}
            onClick={() =>
              run.mutate(action, {
                onSuccess: onClose,
                onError: (error) => {
                  if (error instanceof ApiError && error.status === 404) void queryClient.invalidateQueries({ queryKey: REPORTS_KEY });
                },
              })
            }
          >
            {run.isPending ? <Loader2Icon className="size-4 animate-spin" /> : null} {said.cta}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The reported profile as it stands: its handle, whether it is hidden, and
 * the links and projects on it. For moderate and above, each link and each
 * project can be taken off on its own (the rest of the profile stays), and a
 * hidden profile can be shown again. Links are shown as text, never as
 * links: a reported address is not one to open from the admin portal.
 */
export function ProfilePanel({ profile, hidden, canModerate }: { profile: ReportedProfile; hidden: boolean; canModerate: boolean }) {
  const [pending, setPending] = React.useState<{ action: ProfileAction; words: string } | null>(null);
  const base = { userId: profile.user_id, handle: profile.handle };
  return (
    <div role="group" aria-label="Reported profile" className="bg-sunken flex flex-col gap-2 rounded-[10px] px-3 py-2.5 text-[12.5px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-ink font-mono text-[12.5px]">{at(profile.handle)}</span>
        {hidden ? (
          <span className="tag bg-caution-soft text-caution gap-1">
            <EyeOffIcon className="size-3" aria-hidden="true" /> Hidden
          </span>
        ) : null}
        {hidden && canModerate ? (
          <Button size="xs" variant="secondary" className="ml-auto" onClick={() => setPending({ action: { kind: "unhide", ...base }, words: "" })}>
            <EyeIcon /> Unhide
          </Button>
        ) : null}
      </div>

      {profile.links.length ? (
        <div className="flex flex-col gap-1">
          <span className="eyebrow">Links</span>
          <ul aria-label="Links" className="m-0 flex list-none flex-col gap-1 p-0">
            {profile.links.map((l) => (
              <li key={l.id} data-link={l.id} className="flex items-start gap-2">
                <span className="tag tag-neutral shrink-0">{linkTypeLabel(l.type)}</span>
                <span className="text-ink-2 min-w-0 flex-1 [overflow-wrap:anywhere]">
                  {l.label ? <span className="text-ink">{l.label} · </span> : null}
                  {l.url}
                </span>
                {canModerate ? (
                  <Button
                    size="xs"
                    variant="ghost"
                    danger
                    aria-label={`Remove link ${l.label || l.url}`}
                    onClick={() => setPending({ action: { kind: "link", ...base, itemId: l.id }, words: l.url || l.label || "This link" })}
                  >
                    <XIcon /> Remove
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {profile.projects.length ? (
        <div className="flex flex-col gap-1">
          <span className="eyebrow">Projects</span>
          <ul aria-label="Projects" className="m-0 flex list-none flex-col gap-1 p-0">
            {profile.projects.map((p) => (
              <li key={p.id} data-project={p.id} className="flex items-start gap-2">
                <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                  <span className="text-ink">{p.title || "Untitled project"}</span>
                  {p.url ? <span className="text-ink-2"> · {p.url}</span> : null}
                </span>
                {canModerate ? (
                  <Button
                    size="xs"
                    variant="ghost"
                    danger
                    aria-label={`Remove project ${p.title || p.id}`}
                    onClick={() => setPending({ action: { kind: "project", ...base, itemId: p.id }, words: p.title || "This project" })}
                  >
                    <XIcon /> Remove
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!profile.links.length && !profile.projects.length ? <span className="text-ink-3">No links or projects on it.</span> : null}

      {pending ? <ProfileActionDialog action={pending.action} words={pending.words} onClose={() => setPending(null)} /> : null}
    </div>
  );
}
