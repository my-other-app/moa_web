"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon, MegaphoneIcon, SendIcon } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Textarea,
  cn,
} from "@moa/ui";
import { pressable } from "@moa/ui/motion";

import { useSendAnnouncement } from "../queries";
import { sendAnnouncementSchema, type SendAnnouncementInput } from "../schemas";

export function SendAnnouncementDialog({
  eventId,
  recipientCount,
}: {
  eventId: number;
  recipientCount: number;
}) {
  const [open, setOpen] = React.useState(false);
  const send = useSendAnnouncement();

  const form = useForm<SendAnnouncementInput>({
    resolver: zodResolver(sendAnnouncementSchema),
    defaultValues: { title: "", body: "" },
  });

  async function onSubmit(values: SendAnnouncementInput) {
    await send.mutateAsync({ eventId, input: values });
    form.reset();
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className={pressable}>
          <MegaphoneIcon /> Announce
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send an announcement</DialogTitle>
          <DialogDescription>
            {/* Naming the real audience up front: this is a push notification
                to phones, and there is no recall. */}
            This sends a push notification to{" "}
            <strong>
              {recipientCount.toLocaleString("en-IN")}{" "}
              {recipientCount === 1 ? "person" : "people"}
            </strong>{" "}
            registered for this event. It cannot be unsent.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Venue change" autoFocus />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="body"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Message</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={4} placeholder="We've moved to Hall B." />
                  </FormControl>
                  <FormDescription>
                    {(field.value?.length ?? 0)} / 1000
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={send.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={send.isPending} className={cn(pressable)}>
                {send.isPending ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
                {send.isPending ? "Sending…" : "Send to everyone"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
