import { index, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { orgPolicy } from "../rls";
import { orgId, pk, timestamps, ts, userRef } from "./_shared";
import type { SecurityChangeKind, SecurityChangeStatus } from "./enums";

// Vier-Augen für Sicherheitsänderungen (Härtung A4, ADR-028): kritische
// Änderungen einer Org (SSO erzwingen, DLP lockern, Organisation löschen,
// Vollexport, Zugang zurücksetzen, Token anlegen …) brauchen eine zweite
// Person aus Inhaber:innen und Geschäftsleitung; gibt es niemanden, wirken
// sie nach 24 h Wartezeit. Der Stand wird abgeleitet
// (lib/security-changes/rules.ts), gespeichert ist der Antrag mit seinem
// Ausgang. Wirkung und Erlaubnis nur über lib/security-changes/service.ts.
export const securityChanges = pgTable(
	"security_changes",
	{
		id: pk(),
		organizationId: orgId(),
		kind: text().$type<SecurityChangeKind>().notNull(),
		// worum es genau geht (z. B. Konto bei „Zugang zurücksetzen“,
		// SSO-Verbindung beim Entfernen); null = die ganze Org
		targetKey: text(),
		// lesbare Zusammenfassung für Liste und Mitteilung
		summary: text().notNull(),
		// „wirkt“: neuer Wert und Stand beim Antrag (veraltet = verfällt)
		payload: jsonb().$type<Record<string, unknown>>(),
		before: jsonb().$type<Record<string, unknown>>(),
		status: text().$type<SecurityChangeStatus>().notNull().default("pending"),
		requestedBy: userRef(),
		requestedAt: ts().notNull().defaultNow(),
		// Wartezeit (niemand kann zustimmen): gilt ab hier
		applyAfter: ts(),
		// „erlaubt“: Erlaubnis gilt bis hier
		permitUntil: ts(),
		decidedBy: userRef(),
		decidedAt: ts(),
		decisionNote: text(),
		appliedAt: ts(),
		cancelledBy: userRef(),
		cancelledAt: ts(),
		...timestamps(),
	},
	(t) => [
		index("security_changes_org_idx").on(t.organizationId, t.status),
		orgPolicy("security_changes"),
	],
).enableRLS();

export type SecurityChange = typeof securityChanges.$inferSelect;
