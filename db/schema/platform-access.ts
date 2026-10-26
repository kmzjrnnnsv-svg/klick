import { index, integer, pgTable, text } from "drizzle-orm/pg-core";
import { orgPolicy } from "../rls";
import { orgId, pk, timestamps, ts, userRef } from "./_shared";
import type {
	PlatformAccessScope,
	PlatformAccessStatus,
	PlatformEmergencyCategory,
} from "./enums";

// Lockbox (Härtung A3, ADR-027): Der Plattform-Betrieb greift auf Inhalte
// einer Org nur mit deren Freigabe zu. Die Plattform stellt den Antrag (über
// withPlatform), Inhaber:innen oder Geschäftsleitung entscheiden im
// Org-Kontext. Ob ein Zugriff gerade gilt, wird abgeleitet
// (lib/platform-access/rules.ts), nie gespeichert.
export const platformAccessGrants = pgTable(
	"platform_access_grants",
	{
		id: pk(),
		organizationId: orgId(),
		scope: text().$type<PlatformAccessScope>().notNull(),
		// Person, um die es geht (impersonate, reset_access)
		targetUserId: userRef(),
		reason: text().notNull(),
		durationMinutes: integer().notNull(),
		status: text().$type<PlatformAccessStatus>().notNull().default("requested"),
		emergencyCategory: text().$type<PlatformEmergencyCategory>(),
		requestedBy: userRef(),
		requestedAt: ts().notNull().defaultNow(),
		// Wartezeit: gilt ab hier, solange niemand abbricht
		applyAfter: ts(),
		decidedBy: userRef(),
		decidedAt: ts(),
		decisionNote: text(),
		expiresAt: ts(),
		revokedBy: userRef(),
		revokedAt: ts(),
		usedAt: ts(),
		// Notfall: Bericht der Plattform an die Org
		reportDueAt: ts(),
		report: text(),
		reportedAt: ts(),
		...timestamps(),
	},
	(t) => [
		index("platform_access_grants_org_idx").on(t.organizationId, t.status),
		orgPolicy("platform_access_grants"),
	],
).enableRLS();

export type PlatformAccessGrant = typeof platformAccessGrants.$inferSelect;
