export { PlatformMailPage, defaultFrom } from "./components/mail-page";
export { useMailOverview, useMayReadMail, usePlatformMailOnServer, platformErrorText, PLATFORM_MAIL, OVERVIEW_KEY } from "./queries";
export { fetchMailOverview, platformListQuery, platformMail, ADMIN_MAIL } from "./api";
export { mailOverviewSchema, addressOf, type MailAddress, type MailOverview } from "./schemas";
