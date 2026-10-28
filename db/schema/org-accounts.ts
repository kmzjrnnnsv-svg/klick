import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { organization } from "../auth-schema";
import { ts, userRef } from "./_shared";
import { ORG_ACCOUNT_STATUS } from "./enums";

// Vertrag und Sperre je Organisation (Admin-Portal, Teil 2). Plattform-Daten
// über die Kund:in, keine Inhalte der Org — darum wie andere Plattform-
// Tabellen ohne RLS und ohne organization_id (fällt nicht in den Org-Export);
// Zugriff nur über lib/db/org-accounts.ts. Rechnen pure in lib/admin/contract.ts.

export const platformOrgAccounts = pgTable("platform_org_accounts", {
	orgId: uuid()
		.primaryKey()
		.references(() => organization.id, { onDelete: "cascade" }),
	status: text({ enum: ORG_ACCOUNT_STATUS }).notNull().default("active"),
	// Vertragsbeginn (Berater-Zugänge zählen ab hier, Zahlungsmodell)
	startedAt: ts(),
	// letztes bestandenes Audit: Jahresgebühr wird damit fällig
	auditPassedAt: ts(),
	// Audit, für das die Jahresgebühr schon berechnet ist
	feeInvoicedFor: ts(),
	// Vertragsende bei Kündigung
	cancelledAt: ts(),
	// Sperre: jede Fläche der Org antwortet „gesperrt“ (lib/org/suspension.ts)
	suspendedAt: ts(),
	suspendedReason: text(),
	suspendedBy: userRef(),
	// interne Notiz der Plattform, nie für die Org sichtbar
	note: text(),
	updatedAt: ts().notNull().defaultNow(),
	updatedBy: userRef(),
});

export type PlatformOrgAccount = typeof platformOrgAccounts.$inferSelect;
