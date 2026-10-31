import { pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { orgPolicy } from "../rls";
import { createdAt, orgId, pk, ts, userRef } from "./_shared";

// Mitteilungen an Kund:innen (Admin-Portal, Teil 6). Die Mitteilung selbst ist
// Plattform-Inhalt (ohne organization_id, ohne RLS, wie platform_org_accounts;
// fällt nicht in den Org-Export); Zugriff nur über lib/db/announcements.ts.
// Die Kenntnisnahme gehört der Org (RLS + FORCE). Regeln pure in
// lib/announcements/rules.ts.

export const ANNOUNCEMENT_KINDS = ["info", "maintenance", "incident"] as const;
export type AnnouncementKind = (typeof ANNOUNCEMENT_KINDS)[number];

export const platformAnnouncements = pgTable("platform_announcements", {
	id: pk(),
	kind: text({ enum: ANNOUNCEMENT_KINDS }).notNull(),
	title: text().notNull(),
	body: text().notNull(),
	startsAt: ts().notNull(),
	endsAt: ts(),
	// null = alle Organisationen
	orgIds: uuid().array(),
	createdBy: userRef(),
	createdAt: createdAt(),
	withdrawnAt: ts(),
	withdrawnBy: userRef(),
});

export const announcementAcknowledgements = pgTable(
	"announcement_acknowledgements",
	{
		id: pk(),
		organizationId: orgId(),
		announcementId: uuid()
			.notNull()
			.references(() => platformAnnouncements.id, { onDelete: "cascade" }),
		userId: userRef(),
		acknowledgedAt: createdAt(),
	},
	(t) => [
		uniqueIndex("announcement_acknowledgements_uq").on(
			t.organizationId,
			t.announcementId,
		),
		orgPolicy("announcement_acknowledgements"),
	],
).enableRLS();
