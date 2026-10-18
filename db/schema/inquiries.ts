import { index, pgTable, text } from "drizzle-orm/pg-core";
import { json, pk, timestamps, ts, userRef } from "./_shared";
import { INQUIRY_SOURCES, INQUIRY_STATUS } from "./enums";

// Anfragen an die Plattform (Plattform-Tabelle ohne organization_id, kein
// RLS; Zugriff nur über lib/db/inquiries.ts). Öffentlich über /api/anfrage
// oder aus der App („Leistung anfragen“, dann mit Org-Schnappschuss im
// Kontext). Löschung 12 Monate nach der letzten Änderung (Job retention).

export type InquiryContext = {
	orgId?: string;
	orgName?: string;
	userId?: string;
	priceGroup?: string | null;
	price?: string | null;
	page?: string;
};

export const inquiries = pgTable(
	"inquiries",
	{
		id: pk(),
		source: text({ enum: INQUIRY_SOURCES }).notNull(),
		// Preisposition (svc:gap …) oder "general"
		serviceKey: text().notNull(),
		name: text().notNull(),
		company: text(),
		email: text().notNull(),
		phone: text(),
		message: text().notNull(),
		consentAt: ts().notNull(),
		context: json<InquiryContext>().notNull().default({}),
		status: text({ enum: INQUIRY_STATUS }).notNull().default("new"),
		handledByUserId: userRef(),
		// HMAC der IP (Missbrauch erkennen, keine Klartext-IP)
		ipHash: text(),
		...timestamps(),
	},
	(t) => [
		index("inquiries_status_created_idx").on(t.status, t.createdAt),
		index("inquiries_updated_idx").on(t.updatedAt),
	],
);

export type Inquiry = typeof inquiries.$inferSelect;
