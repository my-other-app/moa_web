import { z } from "zod";

export const volunteerSchema = z
  .object({
    id: z.coerce.number().nullish(),
    full_name: z.string().nullish(),
    name: z.string().nullish(),
    email_id: z.string().nullish(),
    email: z.string().nullish(),
    phone: z.string().nullish(),
    user_id: z.coerce.number().nullish(),
  })
  .passthrough();

export const volunteerListSchema = z
  .union([z.array(volunteerSchema), z.object({ items: z.array(volunteerSchema) })])
  .transform((v) => (Array.isArray(v) ? v : v.items));

export const addVolunteerSchema = z.object({
  full_name: z.string().trim().min(2, "Enter the volunteer's name"),
  email_id: z.string().trim().email("Enter a valid email"),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s]{6,20}$/, "Enter a valid phone number")
    .or(z.literal(""))
    .optional(),
});

export type Volunteer = z.infer<typeof volunteerSchema>;
export type AddVolunteerInput = z.infer<typeof addVolunteerSchema>;
