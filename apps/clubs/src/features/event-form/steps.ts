import type { EventFormValues } from "./schemas";

/**
 * The sections, in the order an organiser decides things: what it is, when,
 * where, how many and at what price, who is involved, how far it reaches,
 * and what to ask at the door. `fields` ties each to the values it owns, so
 * a problem can be pointed at and the rail can mark it.
 */
export interface StepDef {
  id: string;
  title: string;
  description: string;
  fields: Array<keyof EventFormValues>;
}

export const STEPS: StepDef[] = [
  { id: "event", title: "The event", description: "Its name, what kind it is, and the picture and words people see first", fields: ["name", "category_id", "posterFile", "about"] },
  { id: "when", title: "When", description: "The day and the hours, and when sign-up is open", fields: ["event_datetime", "duration", "reg_startdate", "reg_enddate", "agenda"] },
  { id: "where", title: "Where", description: "A venue, or a link", fields: ["is_online", "location_name", "location_link", "lat", "lng", "url"] },
  { id: "entry", title: "Places and money", description: "How many can come, what it costs, and what is on offer", fields: ["max_participants", "has_fee", "reg_fee", "has_prize", "prize_amount", "merch_enabled", "swag_enabled"] },
  { id: "people", title: "People", description: "Who is speaking, and who to ask", fields: ["speakers", "contact_name", "contact_phone", "contact_email"] },
  { id: "reach", title: "Reach and rules", description: "Interests that put it in front of the right followers, a label, and the rules", fields: ["interest_ids", "event_tag", "event_guidelines"] },
  { id: "questions", title: "Sign-up questions", description: "What to ask beyond a name and an email", fields: ["additional_details"] },
];
