export { MailboxPage } from "./components/mailbox-page";
export { MailSettingsPage, useHandleCheck } from "./components/settings-page";
export { MailHtml, MailText, ThreadView } from "./components/thread-view";
export { Composer, composeProblems, defaultRecipients, type ComposeTarget } from "./components/composer";
export { MailUnavailable, LapseNotice, MailUpgradeNotice } from "./components/shared";
export { useMailNotify, useNewMailNotifier, mailNotificationFor, readMailNotify, writeMailNotify, resetMailNotifyCache, MAIL_NOTIFY_KEY } from "./alerts";
export {
  useMailbox,
  useMailboxOnServer,
  useMailSummary,
  errorText,
  NOT_ON_THIS_SERVER,
  MAILBOX_KEY,
  SUMMARY_KEY as MAIL_SUMMARY_KEY,
  THREADS_KEY,
  THREAD_KEY,
} from "./queries";
export { fetchMailbox, sendMail, outgoingForm, inlineImages, fileHref, EXPORT_HREF, MAIL_STREAM_URL, type Outgoing, type ComposeMode } from "./api";
export {
  mailboxSchema,
  messageSchema,
  threadSchema,
  threadDetailSchema,
  threadListSchema,
  summarySchema,
  srcdocFor,
  cidsIn,
  withInlineImages,
  splitAddresses,
  replySubject,
  handleProblem,
  textBlocks,
  CSP_BLOCKED,
  CSP_IMAGES,
  FRAME_SANDBOX,
  FOLDERS,
  type Mailbox,
  type MailMessage,
  type MailThread,
  type ThreadDetail,
} from "./schemas";
