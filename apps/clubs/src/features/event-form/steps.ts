import type { EventFormValues } from "./schemas";

/**
 * Step definitions.
 *
 * `fields` drives per-step validation: advancing only validates that step's
 * fields, so an organiser is not shown errors for a step they have not reached.
 * The cross-field rules in the schema's superRefine still run on final submit.
 */
export interface StepDef {
  id: string;
  title: string;
  description: string;
  fields: Array<keyof EventFormValues>;
}

export const STEPS: StepDef[] = [
  {
    id: "basics",
    title: "Basics",
    description: "What the event is",
    fields: ["name", "category_id", "about", "event_tag", "posterFile", "interest_ids"],
  },
  {
    id: "schedule",
    title: "Schedule",
    description: "When it happens and when people can register",
    fields: ["event_datetime", "duration", "reg_startdate", "reg_enddate"],
  },
  {
    id: "place",
    title: "Place",
    description: "Where it happens",
    fields: ["is_online", "location_name", "url"],
  },
  {
    id: "entry",
    title: "Entry",
    description: "Fees, prizes and capacity",
    fields: ["has_fee", "reg_fee", "has_prize", "prize_amount", "max_participants"],
  },
  {
    id: "details",
    title: "Details",
    description: "Contact, guidelines and speakers",
    fields: [
      "contact_name",
      "contact_phone",
      "contact_email",
      "event_guidelines",
      "speakers",
    ],
  },
  {
    id: "questions",
    title: "Questions",
    description: "What to ask people when they register",
    fields: ["additional_details"],
  },
];
