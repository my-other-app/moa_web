"use client";

import * as React from "react";
import { EyeIcon, Loader2Icon, LockIcon, PaperclipIcon, SendIcon, XIcon } from "lucide-react";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Label, NativeSelect, Notice, Segmented, Textarea, cn, toast } from "@moa/ui";

import { useSavedReplies } from "@/features/teamwork";

import type { UploadedFile } from "../api";
import { usePostMessage, usePreviewReply, useUploadReplyFile } from "../queries";
import { FRAME_SANDBOX, REPLY_FILES_MAX, REPLY_FILE_MAX_BYTES, fileSize, srcdocFor, type ReplyPreview } from "../schemas";

type Mode = "reply_out" | "note";
const BODY_MAX = 10_000;

function PreviewDialog({ preview, files, onClose, onSend, sending }: { preview: ReplyPreview | null; files: UploadedFile[]; onClose: () => void; onSend: () => void; sending: boolean }) {
  const doc = React.useMemo(() => (preview?.html ? srcdocFor(preview.html) : null), [preview]);
  return (
    <Dialog open={preview !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Check the reply before it goes</DialogTitle>
          <DialogDescription>
            {preview?.to ? `To ${preview.to}` : "To the person who wrote in"}
            {preview?.subject ? ` · ${preview.subject}` : ""}
            {preview?.willPush ? " · they also get a push in the app" : ""}
          </DialogDescription>
        </DialogHeader>
        {doc ? (
          <iframe title="The reply as it will be sent" sandbox={FRAME_SANDBOX} referrerPolicy="no-referrer" srcDoc={doc} className="border-line-soft h-[420px] w-full rounded-lg border bg-white" />
        ) : (
          <pre className="bg-sunken m-0 max-h-[420px] overflow-auto rounded-lg p-3 text-[13px] whitespace-pre-wrap">{preview?.text ?? ""}</pre>
        )}
        {files.length > 0 ? (
          <p className="text-ink-2 m-0 flex flex-wrap items-center gap-x-1.5 text-[12.5px]">
            <PaperclipIcon className="text-ink-3 size-3.5" aria-hidden="true" />
            With {files.length === 1 ? "1 file" : `${files.length} files`}: {files.map((f) => f.name).join(", ")}
          </p>
        ) : null}
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
 * Files for the reply or note: each uploaded as it is picked (any kind, 10 MB
 * at most, ten a message), listed with a way to take it off again before
 * anything is sent. Only someone who may answer the case attaches files.
 */
function AttachedFiles({ files, uploading, onRemove }: { files: UploadedFile[]; uploading: number; onRemove: (key: string) => void }) {
  if (files.length === 0 && uploading === 0) return null;
  return (
    <ul aria-label="Attached files" className="m-0 flex list-none flex-wrap gap-1.5 p-0">
      {files.map((f) => (
        <li key={f.key} className="border-line bg-sunken inline-flex max-w-full items-center gap-1.5 rounded-lg border py-1 pr-1 pl-2 text-[12px]">
          <PaperclipIcon className="text-ink-3 size-3.5 shrink-0" aria-hidden="true" />
          <span className="max-w-[220px] truncate">{f.name}</span>
          {f.size ? <span className="text-ink-3 shrink-0">{fileSize(f.size)}</span> : null}
          <button type="button" aria-label={`Remove ${f.name}`} className="text-ink-3 hover:text-ink rounded p-0.5" onClick={() => onRemove(f.key)}>
            <XIcon className="size-3.5" />
          </button>
        </li>
      ))}
      {uploading > 0 ? (
        <li className="text-ink-3 inline-flex items-center gap-1.5 px-1 py-1 text-[12px]">
          <Loader2Icon className="size-3.5 animate-spin" aria-hidden="true" /> Uploading {uploading === 1 ? "a file" : `${uploading} files`}…
        </li>
      ) : null}
    </ul>
  );
}

/**
 * The reply box: a reply to the person (by email from support@, with the
 * case number in the subject; an app account also gets a push) or an
 * internal note they never see. Every reply is previewed before it goes:
 * the box only offers "Preview reply", and Send waits in the preview.
 * Whoever may answer the case can attach files to either.
 */
export function Composer({ caseId, notDelivered, canReply = true }: { caseId: number; notDelivered: boolean; canReply?: boolean }) {
  const replies = useSavedReplies();
  const preview = usePreviewReply(caseId);
  const post = usePostMessage(caseId);
  const upload = useUploadReplyFile(caseId);
  const [chosen, setMode] = React.useState<Mode>(canReply ? "reply_out" : "note");
  // A Support member may note any case, and answer only their own.
  const mode: Mode = canReply ? chosen : "note";
  const [body, setBody] = React.useState("");
  const [savedId, setSavedId] = React.useState<number | undefined>(undefined);
  const [shown, setShown] = React.useState<ReplyPreview | null>(null);
  const [files, setFiles] = React.useState<UploadedFile[]>([]);
  const [uploading, setUploading] = React.useState(0);
  const id = React.useId();
  const ready = body.trim().length > 0 && uploading === 0;
  const input = () => ({
    kind: mode,
    body: body.trim(),
    ...(savedId ? { saved_reply_id: savedId } : {}),
    ...(canReply && files.length > 0 ? { attachments: files.map((f) => f.key) } : {}),
  });
  const clear = () => {
    setBody("");
    setSavedId(undefined);
    setShown(null);
    setFiles([]);
  };

  // Each picked file is uploaded at once; one over the limits is refused here, with words.
  const attach = (picked: File[]) => {
    let room = REPLY_FILES_MAX - files.length - uploading;
    for (const file of picked) {
      if (room <= 0) {
        toast.error(`At most ${REPLY_FILES_MAX} files with one message.`);
        break;
      }
      if (file.size > REPLY_FILE_MAX_BYTES) {
        toast.error(`${file.name} is ${fileSize(file.size)}: each file can be 10 MB at most.`);
        continue;
      }
      if (file.size === 0) {
        toast.error(`${file.name} is empty.`);
        continue;
      }
      room -= 1;
      setUploading((n) => n + 1);
      // mutateAsync, not mutate: mutate's own callbacks fire for the latest call only, and several files go at once.
      // A refusal is already said by the hook's toast.
      upload
        .mutateAsync(file)
        .then((done) => setFiles((list) => [...list, done]))
        .catch(() => undefined)
        .finally(() => setUploading((n) => Math.max(0, n - 1)));
    }
  };

  return (
    <section className="border-line-soft bg-surface flex flex-col gap-3 rounded-2xl border p-4" aria-label="Reply">
      <div className="flex flex-wrap items-center gap-2">
        {canReply ? (
          <Segmented
            label="Reply or note"
            value={mode}
            options={[
              { value: "reply_out", label: "Reply" },
              { value: "note", label: "Internal note" },
            ]}
            onChange={setMode}
          />
        ) : (
          <span className="text-ink-2 text-[13px] font-medium">Internal note</span>
        )}
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
      {canReply ? <AttachedFiles files={files} uploading={uploading} onRemove={(key) => setFiles((list) => list.filter((f) => f.key !== key))} /> : null}
      <div className={cn("flex flex-wrap items-center gap-2", canReply ? "justify-between" : "justify-end")}>
        {canReply ? (
          <label
            className={cn("btn btn-ghost btn-sm cursor-pointer", files.length + uploading >= REPLY_FILES_MAX && "pointer-events-none opacity-50")}
            title={`Any file, up to 10 MB each; ${REPLY_FILES_MAX} at most`}
          >
            <PaperclipIcon className="size-4" aria-hidden="true" />
            Attach files
            <input
              type="file"
              multiple
              className="sr-only"
              aria-label="Attach files"
              disabled={files.length + uploading >= REPLY_FILES_MAX}
              onChange={(e) => {
                const picked = Array.from(e.currentTarget.files ?? []);
                e.currentTarget.value = "";
                attach(picked);
              }}
            />
          </label>
        ) : null}
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
      <PreviewDialog preview={shown} files={canReply ? files : []} sending={post.isPending} onClose={() => setShown(null)} onSend={() => post.mutate(input(), { onSuccess: clear })} />
    </section>
  );
}
