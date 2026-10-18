"use client";

import * as React from "react";
import { ArrowDownIcon, ArrowRightLeftIcon, ArrowUpIcon, ChevronRightIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { TopicDot, formatNumber, interestEmoji, isTopicAware, topicColor, topicLabel, topicTint, type TopicStats } from "@moa/app-kit";
import { Button, IconButton, InlineAlert, Notice, Skeleton, cn } from "@moa/ui";

import { useCan } from "@/hooks/use-can";

import { useReorder, useTopicStats, useTopicTree } from "../queries";
import { isMissingEndpoint, reorderInterest, reorderTopic, type Topic, type TopicInterest } from "../schemas";
import { DeleteTopicDialog } from "./delete-topic-dialog";
import { DeleteInterestDialog, InterestDialog, MoveInterestDialog } from "./interest-dialogs";
import { TopicDialog } from "./topic-dialog";

/**
 * Topics -- the main categories (Development, Deep Tech, Arts…) -- in the
 * order people see them, each opening onto its interests.
 *
 * A topic can be added, edited, deleted (its interests moved elsewhere
 * first) and moved up or down; an interest can be added, edited, moved up or
 * down within its topic, moved to another topic, or deleted. Each topic and
 * interest shows how much it is used, from /interests/topics.
 *
 * Before the backend's topics release, ordering, editing and deleting topics
 * have nowhere to go: the page says so once, calmly, and keeps everything
 * that works today (adding a topic, and all of interests) working.
 */

const plural = (n: number, one: string, many: string) => `${formatNumber(n)} ${n === 1 ? one : many}`;

type Dialog =
  | { kind: "topic"; topicId?: number }
  | { kind: "delete-topic"; topicId: number }
  | { kind: "interest"; topicId: number; interestId?: number }
  | { kind: "move"; topicId: number; interestId: number }
  | { kind: "delete-interest"; topicId: number; interestId: number }
  | null;

interface Abilities {
  /** The server has the topics release: order, edit and delete topics. */
  ready: boolean;
  edit: boolean;
  destroy: boolean;
  busy: boolean;
}

function InterestRow({
  topic,
  interest,
  index,
  count,
  upcoming,
  can,
  canMove,
  onMoveBy,
  onOpen,
}: {
  topic: Topic;
  interest: TopicInterest;
  index: number;
  count: number;
  upcoming: number | undefined;
  can: Abilities;
  canMove: boolean;
  onMoveBy: (delta: -1 | 1) => void;
  onOpen: (dialog: Dialog) => void;
}) {
  const emoji = interestEmoji(interest);
  const name = interest.name;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2">
      <div className="flex min-w-0 flex-1 basis-[220px] items-center gap-2">
        {emoji ? (
          <span aria-hidden="true" className="text-[14px] leading-none">
            {emoji}
          </span>
        ) : null}
        <span className="text-ink truncate text-[13.5px] font-medium">{name}</span>
        {interest.slug ? <code className="text-ink-3 truncate font-mono text-[11px]">{interest.slug}</code> : null}
        {upcoming !== undefined ? <span className="text-ink-3 shrink-0 text-[12px] tabular-nums">· {plural(upcoming, "upcoming event", "upcoming events")}</span> : null}
      </div>
      {can.edit || can.destroy ? (
        <div className="flex items-center gap-1">
          {can.edit ? (
            <>
              <IconButton size="xs" variant="quiet" label={`Move ${name} up`} disabled={!can.ready || can.busy || index === 0} onClick={() => onMoveBy(-1)}>
                <ArrowUpIcon />
              </IconButton>
              <IconButton size="xs" variant="quiet" label={`Move ${name} down`} disabled={!can.ready || can.busy || index === count - 1} onClick={() => onMoveBy(1)}>
                <ArrowDownIcon />
              </IconButton>
              <IconButton size="xs" variant="quiet" label={`Move ${name} to another topic`} disabled={!canMove} onClick={() => onOpen({ kind: "move", topicId: topic.id, interestId: interest.id })}>
                <ArrowRightLeftIcon />
              </IconButton>
              <IconButton size="xs" variant="quiet" label={`Edit ${name}`} onClick={() => onOpen({ kind: "interest", topicId: topic.id, interestId: interest.id })}>
                <PencilIcon />
              </IconButton>
            </>
          ) : null}
          {can.destroy ? (
            <IconButton size="xs" variant="quiet" danger label={`Delete ${name}`} onClick={() => onOpen({ kind: "delete-interest", topicId: topic.id, interestId: interest.id })}>
              <Trash2Icon />
            </IconButton>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function TopicRow({
  topic,
  index,
  count,
  stats,
  open,
  can,
  canMoveInterests,
  onToggle,
  onMoveBy,
  onMoveInterestBy,
  onOpen,
}: {
  topic: Topic;
  index: number;
  count: number;
  stats: TopicStats | undefined;
  open: boolean;
  can: Abilities;
  canMoveInterests: boolean;
  onToggle: () => void;
  onMoveBy: (delta: -1 | 1) => void;
  onMoveInterestBy: (interestId: number, delta: -1 | 1) => void;
  onOpen: (dialog: Dialog) => void;
}) {
  const panelId = React.useId();
  const color = topicColor(topic);
  const emoji = interestEmoji(topic);
  const name = topicLabel(topic.name);
  const upcomingByInterest = new Map(stats?.interests.map((i) => [i.id, i.upcoming_events]) ?? []);
  const figures = [
    plural(topic.interests.length, "interest", "interests"),
    stats ? plural(stats.clubs, "club", "clubs") : null,
    stats ? plural(stats.upcoming_events, "upcoming event", "upcoming events") : null,
  ].filter(Boolean);

  return (
    <li data-topic={topic.slug ?? topic.id} className="bg-surface border-line-soft shadow-card rounded-[var(--radius-card)] border">
      <div className="flex flex-wrap items-center gap-3 p-3">
        <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl border text-[16px] leading-none" style={topicTint(color, 14, 40)}>
          {emoji ?? <TopicDot color={color} className="size-2.5" />}
        </span>
        <div className="min-w-0 flex-1 basis-[220px]">
          <h3 className="m-0">
            <button type="button" aria-expanded={open} aria-controls={panelId} onClick={onToggle} className="text-ink hover:text-brand inline-flex max-w-full items-center gap-1.5 text-left text-[15px] font-semibold tracking-[-0.01em]">
              <ChevronRightIcon aria-hidden="true" className={cn("text-ink-3 size-4 shrink-0 transition-transform motion-reduce:transition-none", open && "rotate-90")} />
              <span className="truncate">{name}</span>
            </button>
          </h3>
          <div className="text-ink-3 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-[22px] text-[12px]">
            {topic.slug ? <code className="font-mono text-[11px]">{topic.slug}</code> : null}
            {topic.slug ? <span aria-hidden="true">·</span> : null}
            <span className="tabular-nums">{figures.join(" · ")}</span>
          </div>
        </div>
        {can.edit || can.destroy ? (
          <div className="flex flex-wrap items-center gap-1">
            {can.edit ? (
              <>
                <IconButton size="xs" variant="quiet" label={`Move ${name} up`} disabled={!can.ready || can.busy || index === 0} onClick={() => onMoveBy(-1)}>
                  <ArrowUpIcon />
                </IconButton>
                <IconButton size="xs" variant="quiet" label={`Move ${name} down`} disabled={!can.ready || can.busy || index === count - 1} onClick={() => onMoveBy(1)}>
                  <ArrowDownIcon />
                </IconButton>
                <Button size="xs" variant="secondary" onClick={() => onOpen({ kind: "interest", topicId: topic.id })} aria-label={`Add an interest to ${name}`}>
                  <PlusIcon /> Interest
                </Button>
                <IconButton size="xs" variant="quiet" label={`Edit ${name}`} disabled={!can.ready} onClick={() => onOpen({ kind: "topic", topicId: topic.id })}>
                  <PencilIcon />
                </IconButton>
              </>
            ) : null}
            {can.destroy ? (
              <IconButton size="xs" variant="quiet" danger label={`Delete ${name}`} disabled={!can.ready} onClick={() => onOpen({ kind: "delete-topic", topicId: topic.id })}>
                <Trash2Icon />
              </IconButton>
            ) : null}
          </div>
        ) : null}
      </div>

      {open ? (
        <div id={panelId} className="border-line-soft border-t px-3 pt-1 pb-2">
          {topic.description ? <p className="text-ink-2 m-0 pt-2 text-[12.5px]">{topic.description}</p> : null}
          {topic.interests.length ? (
            <ul aria-label={`Interests in ${name}`} className="divide-line-soft m-0 list-none divide-y p-0">
              {topic.interests.map((interest, i) => (
                <InterestRow
                  key={interest.id}
                  topic={topic}
                  interest={interest}
                  index={i}
                  count={topic.interests.length}
                  upcoming={stats ? (upcomingByInterest.get(interest.id) ?? 0) : undefined}
                  can={can}
                  canMove={canMoveInterests}
                  onMoveBy={(delta) => onMoveInterestBy(interest.id, delta)}
                  onOpen={onOpen}
                />
              ))}
            </ul>
          ) : (
            <p className="text-ink-3 m-0 py-3 text-[12.5px]">Nothing under this topic yet.{can.edit ? " Add an interest, or move one here from another topic." : ""}</p>
          )}
        </div>
      ) : null}
    </li>
  );
}

export function TopicsManager() {
  const tree = useTopicTree();
  const stats = useTopicStats();
  const reorder = useReorder();
  const canEdit = useCan("manage_content");
  const canDestroy = useCan("destroy");
  const [dialog, setDialog] = React.useState<Dialog>(null);
  const [openIds, setOpenIds] = React.useState<Set<number> | null>(null);
  // An endpoint that answered 404/405 when asked: the server is older than this page.
  const [missingSeen, setMissingSeen] = React.useState(false);
  const markMissing = React.useCallback(() => setMissingSeen(true), []);

  const topics = tree.data ?? [];
  const aware = isTopicAware(topics);
  // Ready once the list carries the topics release's fields, or /interests/topics answers.
  const ready = !missingSeen && (aware || (stats.isSuccess && stats.data !== null));
  const checking = !aware && stats.isPending;
  const statsById = new Map((stats.data ?? []).map((s) => [s.id, s]));
  const can: Abilities = { ready, edit: canEdit, destroy: canDestroy, busy: reorder.isPending };
  // With one topic, it starts open: there is nothing else to look at.
  const isOpen = (id: number) => (openIds ? openIds.has(id) : topics.length === 1);
  const allOpen = topics.length > 0 && topics.every((t) => isOpen(t.id));

  const toggle = (id: number) =>
    setOpenIds((prev) => {
      const next = new Set(prev ?? (topics.length === 1 ? topics.map((t) => t.id) : []));
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const runReorder = ({ next, body }: ReturnType<typeof reorderTopic>) =>
    reorder.mutate(
      { next, body },
      {
        // The calm notice, not a red toast, for a server without the endpoint (the rows go back as they were).
        onError: (error) => {
          if (isMissingEndpoint(error)) markMissing();
        },
      },
    );

  if (tree.isPending) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[62px] w-full rounded-[var(--radius-card)]" />
        ))}
      </div>
    );
  }

  if (tree.isError) {
    return (
      <InlineAlert tone="destructive" title="Could not load the topics">
        {tree.error instanceof Error ? tree.error.message : "Try again in a moment."}
      </InlineAlert>
    );
  }

  const interestCount = topics.reduce((n, t) => n + t.interests.length, 0);
  const dialogTopic = dialog && "topicId" in dialog && dialog.topicId != null ? topics.find((t) => t.id === dialog.topicId) : undefined;
  const dialogInterest = dialog && "interestId" in dialog && dialog.interestId != null ? dialogTopic?.interests.find((i) => i.id === dialog.interestId) : undefined;
  const close = () => setDialog(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {canEdit ? (
          <>
            <Button size="sm" onClick={() => setDialog({ kind: "topic" })}>
              <PlusIcon /> New topic
            </Button>
            <Button size="sm" variant="secondary" disabled={topics.length === 0} onClick={() => setDialog({ kind: "interest", topicId: topics[0]!.id })}>
              <PlusIcon /> New interest
            </Button>
          </>
        ) : null}
        <span className="text-ink-3 ml-auto text-[12.5px] tabular-nums">
          {plural(topics.length, "topic", "topics")} · {plural(interestCount, "interest", "interests")}
        </span>
        {topics.length > 1 ? (
          <Button size="sm" variant="ghost" onClick={() => setOpenIds(allOpen ? new Set() : new Set(topics.map((t) => t.id)))}>
            {allOpen ? "Collapse all" : "Expand all"}
          </Button>
        ) : null}
      </div>

      {!ready && !checking ? (
        <Notice tone="neutral" tag="Backend update">
          Ordering topics and their interests, editing and deleting topics, and topic colours and counts arrive with the backend&apos;s topics update, which is not live yet. Until then every interest sits under one topic. Adding a topic, and adding, editing, moving and deleting interests, work now.
        </Notice>
      ) : null}
      {stats.isError ? <p className="text-ink-3 m-0 text-[12.5px]">The counts could not load just now; everything else works.</p> : null}

      {topics.length === 0 ? (
        <div className="flex flex-col items-start gap-1 py-8">
          <span className="text-[16px]">No topics yet</span>
          <span className="text-ink-2 text-[13px]">Add a topic first; interests live inside one.</span>
        </div>
      ) : (
        <ol aria-label="Topics, in order" className="m-0 flex list-none flex-col gap-2 p-0">
          {topics.map((topic, index) => (
            <TopicRow
              key={topic.id}
              topic={topic}
              index={index}
              count={topics.length}
              stats={statsById.get(topic.id)}
              open={isOpen(topic.id)}
              can={can}
              canMoveInterests={topics.length > 1}
              onToggle={() => toggle(topic.id)}
              onMoveBy={(delta) => runReorder(reorderTopic(topics, topic.id, delta))}
              onMoveInterestBy={(interestId, delta) => runReorder(reorderInterest(topics, topic.id, interestId, delta))}
              onOpen={setDialog}
            />
          ))}
        </ol>
      )}

      <TopicDialog open={dialog?.kind === "topic"} existing={dialog?.kind === "topic" ? dialogTopic : undefined} ready={ready} onClose={close} onMissing={markMissing} />
      <InterestDialog
        open={dialog?.kind === "interest"}
        topics={topics}
        existing={dialog?.kind === "interest" ? dialogInterest : undefined}
        topicId={dialog?.kind === "interest" ? dialog.topicId : undefined}
        ready={ready}
        onClose={close}
      />
      {dialog?.kind === "delete-topic" && dialogTopic ? <DeleteTopicDialog topic={dialogTopic} topics={topics} onClose={close} onMissing={markMissing} /> : null}
      {dialog?.kind === "move" && dialogTopic && dialogInterest ? <MoveInterestDialog interest={dialogInterest} from={dialogTopic} topics={topics} onClose={close} /> : null}
      {dialog?.kind === "delete-interest" && dialogInterest ? <DeleteInterestDialog interest={dialogInterest} onClose={close} onMissing={markMissing} /> : null}
    </div>
  );
}
