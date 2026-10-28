export { EventPartnersSection, LogoTile } from "./components/event-partners-section";
export {
  useEventPartners,
  useCreateEventPartner,
  useUpdateEventPartner,
  useUploadEventPartnerLogo,
  useDeleteEventPartner,
  useOrderEventPartners,
  useAddFromClubPartners,
  eventPartnersKey,
} from "./queries";
export {
  eventPartnerSchema,
  partnerDraftSchema,
  partnersSupported,
  normaliseLink,
  isHttpsLink,
  byKind,
  moved,
  MAX_EVENT_PARTNERS,
  PARTNER_KINDS,
  type EventPartner,
  type PartnerKind,
  type PartnerForm,
} from "./schemas";
