import {
	date,
	index,
	integer,
	pgTable,
	text,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { orgPolicy } from "../rls";
import { json, orgId, pk, ts, userRef } from "./_shared";
import type { AlertChannel } from "./enums";
import { processes } from "./registers";

// Notfallmanagement (N3): ein Notfall- und Wiederanlaufplan je Prozess,
// strukturiert statt als Freitext. Schreiben nur über lib/bcm/plan-service.ts.

export const BCM_PLAN_STATUSES = ["draft", "released"] as const;
export type BcmPlanStatus = (typeof BCM_PLAN_STATUSES)[number];

export type BcmPlanContent = {
	// Wann gilt der Notfall, wer ruft ihn aus
	trigger: string;
	activatedBy: string;
	// Sofortmaßnahmen in Reihenfolge
	immediate: { text: string }[];
	// Alarmierungskette: wer, wie, binnen wie vieler Minuten
	alert: {
		// Funktion (function:<key>), Person (Konto-ID) oder frei (Name)
		who: string;
		channel: AlertChannel;
		withinMinutes: number | null;
	}[];
	// Notbetrieb: wie der Prozess eingeschränkt weiterläuft
	emergencyMode: string;
	// Wiederanlauf in Reihenfolge, je Schritt zuständig und Ziel in Stunden
	recovery: {
		text: string;
		who: string;
		targetHours: number | null;
		assetId: string | null;
	}[];
	// Rückkehr zum Normalbetrieb
	returnToNormal: string;
	// Kontakte außerhalb von Klick (Dienstleister-Hotline, Behörde …)
	contacts: { name: string; role: string; phone: string; mail: string }[];
};

export const bcmPlans = pgTable(
	"bcm_plans",
	{
		id: pk(),
		organizationId: orgId(),
		processId: uuid()
			.notNull()
			.references(() => processes.id, { onDelete: "cascade" }),
		status: text({ enum: BCM_PLAN_STATUSES }).notNull().default("draft"),
		// zählt mit jeder Freigabe hoch
		version: integer().notNull().default(0),
		content: json<BcmPlanContent>().notNull(),
		releasedAt: ts(),
		releasedBy: userRef(),
		// nächste Überprüfung (12 Monate nach der Freigabe)
		reviewAt: date(),
		updatedBy: userRef(),
		createdAt: ts().notNull().defaultNow(),
		updatedAt: ts().notNull().defaultNow(),
	},
	(t) => [
		uniqueIndex("bcm_plans_org_process_uq").on(t.organizationId, t.processId),
		index("bcm_plans_process_idx").on(t.processId),
		orgPolicy("bcm_plans"),
	],
).enableRLS();

export type BcmPlan = typeof bcmPlans.$inferSelect;
