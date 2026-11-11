"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label, NativeSelect, Segmented, Textarea } from "@moa/ui";

import { ClubPicker, type PickedClub } from "@/components/club-picker";
import { PRIORITIES, PRIORITY_LABEL, usePublicTopics } from "@/features/teamwork";

import { useLogCase } from "../queries";

type Who = "person" | "club";

function LogCaseForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const topics = usePublicTopics();
  const log = useLogCase();
  const [who, setWho] = React.useState<Who>("person");
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [club, setClub] = React.useState<PickedClub | null>(null);
  const [topic, setTopic] = React.useState("");
  const [priority, setPriority] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [message, setMessage] = React.useState("");
  const requesterReady = who === "club" ? club !== null : /.+@.+\..+/.test(email.trim()) && name.trim().length > 0;
  const ready = requesterReady && topic && subject.trim() && message.trim();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        log.mutate(
          {
            requester: who === "club" && club ? { club_id: club.id } : { email: email.trim(), name: name.trim() },
            topic,
            subject: subject.trim(),
            message: message.trim(),
            priority: priority || undefined,
          },
          {
            onSuccess: (created) => {
              onDone();
              router.push(`/teamwork/support/${created.id}`);
            },
          }
        );
      }}
    >
      <Segmented
        label="Who it's from"
        value={who}
        options={[
          { value: "person", label: "A person" },
          { value: "club", label: "A club" },
        ]}
        onChange={setWho}
      />
      {who === "person" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="log-name">Name</Label>
            <Input id="log-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="log-email">Email</Label>
            <Input id="log-email" type="email" value={email} maxLength={254} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <p className="text-ink-3 m-0 text-[12px] sm:col-span-2">An app account with this email is linked; replies go to this address.</p>
        </div>
      ) : (
        <ClubPicker value={club} onChange={setClub} />
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="log-topic">Topic</Label>
          <NativeSelect id="log-topic" value={topic} onChange={(e) => setTopic(e.target.value)}>
            <option value="">Pick a topic</option>
            {(topics.data ?? []).map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="log-priority">Priority</Label>
          <NativeSelect id="log-priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="">The topic&apos;s own</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="log-subject">Subject</Label>
        <Input id="log-subject" value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="log-message">What they said</Label>
        <Textarea id="log-message" rows={5} value={message} maxLength={5000} placeholder="On a call at 4 pm: their ticket email never came…" onChange={(e) => setMessage(e.target.value)} />
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={!ready || log.isPending}>
          {log.isPending ? <Loader2Icon className="animate-spin" /> : null}
          Log case
        </Button>
      </DialogFooter>
    </form>
  );
}

/** A call or a WhatsApp message, recorded by hand: one click from the queue, so nothing stays outside the desk. */
export function LogCaseDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Log a case by hand</DialogTitle>
          <DialogDescription>A call, a WhatsApp message, a word at an event: it gets a number and an owner like any other.</DialogDescription>
        </DialogHeader>
        {open ? <LogCaseForm onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}
