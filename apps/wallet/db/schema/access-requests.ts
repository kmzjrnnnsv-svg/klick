import { index, pgTable, text } from "drizzle-orm/pg-core";
import { pk, timestamps, ts } from "../../../../db/columns";
import { ACCESS_REQUEST_PURPOSES, ACCESS_REQUEST_STATUS } from "./enums";

// Anfragen „Zugang anfragen“ von der Startseite (Plattform, ohne Org-Bezug,
// kein RLS wie sanctioned_addresses; Zugriff nur über
// lib/db/access-requests.ts). IP nur als HMAC; nie eine Mail an die
// angegebene Adresse. Gelöscht 12 Monate nach der letzten Änderung
// (Job retention).
export const accessRequests = pgTable(
	"access_requests",
	{
		id: pk(),
		name: text().notNull(),
		company: text().notNull(),
		email: text().notNull(),
		purpose: text({ enum: ACCESS_REQUEST_PURPOSES }).notNull(),
		message: text(),
		ipHash: text().notNull(),
		consentAt: ts().notNull(),
		status: text({ enum: ACCESS_REQUEST_STATUS }).notNull().default("new"),
		// Mail an die Betreiber:innen verschickt (Job notification-mail)
		notifiedAt: ts(),
		...timestamps(),
	},
	(t) => [
		index("access_requests_status_idx").on(t.status, t.createdAt),
		index("access_requests_updated_idx").on(t.updatedAt),
	],
);

export type AccessRequest = typeof accessRequests.$inferSelect;
