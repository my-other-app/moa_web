"use client";

import * as React from "react";
import { EyeIcon, Loader2Icon, LockIcon, SendIcon } from "lucide-react";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Label, NativeSelect, Notice, Segmented, Textarea } from "@moa/ui";

import { useSavedReplies } from "@/features/teamwork";

import { usePostMessage, usePreviewReply } from "../queries";
import { FRAME_SANDBOX, srcdocFor, type ReplyPreview } from "../schemas";

type Mode = "reply_out" | "note";
const BODY_MAX = 10_000;

function PreviewDialog({ preview, onClose, onSend, sending }: { preview: ReplyPreview | null; onClose: () => void; onSend: () => void; sending: boolean }) {
  const doc = React.useMemo(() => (preview?.html ? srcdocFor(preview.html) : null), [preview]);
  return (
    <Dialog open={preview !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Check the reply before it goes</DialogTitle>
          <DialogDescription>
            {preview?.to ? `To ${preview.to}` : "To the person who wrote in"}
            {preview?.subject ? ` · ${preview.subject}` : ""}
          </DialogDescription>
        </DialogHeader>
        {doc ? (
          <iframe title="The reply as it will be sent" sandbox={FRAME_SANDBOX} referrerPolicy="no-referrer" srcDoc={doc} className="border-line-soft h-[420px] w-full rounded-lg border bg-white" />
        ) : (
          <pre className="bg-sunken m-0 max-h-[420px] overflow-auto rounded-lg p-3 text-[13px] whitespace-pre-wrap">{preview?.text ?? ""}</pre>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={sending}>
            Keep editing
          </Button>
          <Button onClick={onSend} disabled={sending}>
            {sending ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
            Send reply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The reply box: a reply to the person (by email from support@, with the
 * case number in the subject; an app account also gets a push) or an
 * internal note they never see. Every reply is previewed before it goes:
 * the box only offers "Preview reply", and Send waits in the preview.
 */
export function Composer({ caseId, notDelivered }: { caseId: number; notDelivered: boolean }) {
  const replies = useSavedReplies();
  const preview = usePreviewReply(caseId);
  const post = usePostMessage(caseId);
  const [mode, setMode] = React.useState<Mode>("reply_out");
  const [body, setBody] = React.useState("");
  const [savedId, setSavedId] = React.useState<number | undefined>(undefined);
  const [shown, setShown] = React.useState<ReplyPreview | null>(null);
  const id = React.useId();
  const ready = body.trim().length > 0;
  const input = () => ({ kind: mode, body: body.trim(), ...(savedId ? { saved_reply_id: savedId } : {}) });
  const clear = () => {
    setBody("");
    setSavedId(undefined);
    setShown(null);
  };

  return (
    <section className="border-line-soft bg-surface flex flex-col gap-3 rounded-2xl border p-4" aria-label="Reply">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="Reply or note"
          value={mode}
          options={[
            { value: "reply_out", label: "Reply" },
            { value: "note", label: "Internal note" },
          ]}
          onChange={setMode}
        />
        {replies.data && replies.data.length > 0 ? (
          <NativeSelect
            aria-label="Insert a saved reply"
            size="sm"
            className="ml-auto w-auto"
            value=""
            onChange={(e) => {
              const picked = replies.data?.find((r) => String(r.id) === e.target.value);
              if (!picked) return;
              setBody((b) => (b.trim() ? `${b.trimEnd()}\n\n${picked.body}` : picked.body));
              setSavedId(picked.id);
            }}
          >
            <option value="">Insert a saved reply…</option>
            {replies.data.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </NativeSelect>
        ) : null}
      </div>
      {notDelivered && mode === "reply_out" ? (
        <Notice tone="caution" tag="Bounced">
          Our last reply didn&apos;t reach them. Try another way (a call, WhatsApp) and log it as a note.
        </Notice>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id} className="sr-only">
          {mode === "note" ? "Internal note" : "Reply"}
        </Label>
        <Textarea
          id={id}
          rows={6}
          maxLength={BODY_MAX}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={mode === "note" ? "Only the team sees this." : "Write to them. **bold**, *italic*, links and lists work."}
          className={mode === "note" ? "bg-caution-soft" : undefined}
        />
      </div>
      <div className="flex items-center justify-end gap-2">
        {mode === "note" ? (
          <Button disabled={!ready || post.isPending} onClick={() => post.mutate(input(), { onSuccess: clear })}>
            {post.isPending ? <Loader2Icon className="animate-spin" /> : <LockIcon />}
            Add note
          </Button>
        ) : (
          <Button disabled={!ready || preview.isPending} onClick={() => preview.mutate(input(), { onSuccess: setShown })}>
            {preview.isPending ? <Loader2Icon className="animate-spin" /> : <EyeIcon />}
            Preview reply
          </Button>
        )}
      </div>
      <PreviewDialog preview={shown} sending={post.isPending} onClose={() => setShown(null)} onSend={() => post.mutate(input(), { onSuccess: clear })} />
    </section>
  );
}
