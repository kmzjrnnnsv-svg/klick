import { z } from "zod";
import { ANNOUNCEMENT_KINDS } from "@/db/schema/announcements";

// Mitteilung an Kund:innen (Admin > Mitteilungen). Zeiten kommen als ISO mit
// Zeitzone aus dem Browser; null bei orgIds = alle Organisationen.
export const announcementSchema = z.object({
	kind: z.enum(ANNOUNCEMENT_KINDS),
	title: z.string().trim().min(3).max(140),
	body: z.string().trim().min(10).max(4000),
	startsAt: z.coerce.date(),
	endsAt: z.coerce.date().nullable(),
	orgIds: z.array(z.uuid()).min(1).max(1000).nullable(),
});
export type AnnouncementInput = z.infer<typeof announcementSchema>;
