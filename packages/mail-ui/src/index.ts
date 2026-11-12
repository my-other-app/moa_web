/**
 * The mail screens both dashboards show: a club's own mailbox (the club
 * dashboard's Mail) and the platform's admin@, developer@, developers@ and
 * info@ (the admin portal's Mail). One implementation, given whose mailbox
 * by a <MailProvider>: where it asks, its cache keys, who "we" are on mail
 * it sent, and its refusals in words.
 */
export { MailProvider, useMailConfig, type MailConfig } from "./context";
export {
  fileHref,
  fetchFile,
  inlineImages,
  mailClient,
  offsetQuery,
  outgoingForm,
  type ComposeMode,
  type FetchFile,
  type ListQuery,
  type MailClient,
  type Outgoing,
  type ThreadQuery,
} from "./client";
export {
  THREADS_PAGE,
  isLapsedError,
  mailErrorText,
  threadsOf,
  useApplyMailRefresh,
  useDeleteThread,
  useErrorText,
  useMarkRead,
  useMarkUnread,
  useMoveThread,
  useRefreshMail,
  useRetryMail,
  useSendMail,
  useThread,
  useThreads,
  type MailRefreshPlan,
} from "./queries";
export {
  CSP_BLOCKED,
  CSP_IMAGES,
  FOLDERS,
  FOLDER_LABEL,
  FRAME_SANDBOX,
  INLINE_IMAGE_MAX,
  MAIL_ERROR_TEXT,
  MAX_ATTACHMENT_BYTES,
  MESSAGE_STATUSES,
  attachmentSchema,
  cidsIn,
  formatBytes,
  initialsOf,
  isAddress,
  messageSchema,
  replySubject,
  senderName,
  splitAddresses,
  srcdocFor,
  summarySchema,
  textBlocks,
  threadDetailSchema,
  threadListSchema,
  threadSchema,
  withInlineImages,
  type Folder,
  type MailAttachment,
  type MailMessage,
  type MailSummary,
  type MailThread,
  type MessageStatus,
  type ThreadDetail,
  type ThreadList,
} from "./schemas";
export { FolderNav, ThreadRow, folderUnread, useDebounced } from "./components/thread-list";
export { MailHtml, MailText, ThreadView, type ThreadViewProps } from "./components/thread-view";
export {
  Composer,
  MODE_TITLE,
  composeProblems,
  defaultRecipients,
  refusedWith,
  type ComposeProblems,
  type ComposeTarget,
  type ComposerProps,
  type FromChoice,
} from "./components/composer";
