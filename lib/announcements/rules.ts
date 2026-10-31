// Mitteilungen an Kund:innen (Admin-Portal, Teil 6), rein und getestet in
// tests/announcements.test.ts. Eine Mitteilung gilt für alle oder ausgewählte
// Organisationen in einem Zeitraum; ein Sicherheitsvorfall verlangt die
// Kenntnisnahme je Organisation (Pflicht als Auftragsverarbeiter, Art. 33
// Abs. 2 DSGVO, und als IKT-Dienstleister). Stand wird abgeleitet, nie
// gespeichert.

import type { AnnouncementKind } from "@/db/schema/announcements";

export {
	ANNOUNCEMENT_KINDS,
	type AnnouncementKind,
} from "@/db/schema/announcements";

export type AnnouncementLike = {
	kind: AnnouncementKind;
	startsAt: Date;
	endsAt: Date | null;
	withdrawnAt: Date | null;
	/** null = alle Organisationen */
	orgIds: string[] | null;
};

export type AnnouncementState = "scheduled" | "active" | "ended" | "withdrawn";

export function announcementState(
	a: AnnouncementLike,
	now: Date,
): AnnouncementState {
	if (a.withdrawnAt) return "withdrawn";
	if (now.getTime() < a.startsAt.getTime()) return "scheduled";
	if (a.endsAt && now.getTime() >= a.endsAt.getTime()) return "ended";
	return "active";
}

export function appliesTo(a: AnnouncementLike, orgId: string): boolean {
	return a.orgIds === null || a.orgIds.includes(orgId);
}

/** Kenntnisnahme je Organisation nur beim Sicherheitsvorfall. */
export const needsAcknowledgement = (kind: AnnouncementKind) =>
	kind === "incident";

/**
 * Banner in der App: sichtbare Mitteilungen dieser Org (Wartung schon
 * 3 Tage vorher). Ein Vorfall bleibt
 * stehen, bis die Org ihn zur Kenntnis genommen hat (oder er endet).
 * Reihenfolge: Vorfall, Wartung, Info; innerhalb nach Beginn, neueste zuerst.
 */
export function bannersFor<T extends AnnouncementLike & { id: string }>(
	list: readonly T[],
	orgId: string,
	now: Date,
	acknowledged: ReadonlySet<string>,
): T[] {
	const order: Record<AnnouncementKind, number> = {
		incident: 0,
		maintenance: 1,
		info: 2,
	};
	return list
		.filter(
			(a) =>
				shownNow(a, now) &&
				appliesTo(a, orgId) &&
				!(needsAcknowledgement(a.kind) && acknowledged.has(a.id)),
		)
		.sort(
			(a, b) =>
				order[a.kind] - order[b.kind] ||
				b.startsAt.getTime() - a.startsAt.getTime(),
		);
}

/** Wartung vorab: so lange vor Beginn erscheint sie schon als Hinweis. */
export const MAINTENANCE_LEAD_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Sichtbar ab: Wartung erscheint bis zu 3 Tage vorher (mit Zeitfenster),
 * alles andere ab Beginn.
 */
export function visibleFrom(a: AnnouncementLike): Date {
	return a.kind === "maintenance"
		? new Date(a.startsAt.getTime() - MAINTENANCE_LEAD_MS)
		: a.startsAt;
}

export function shownNow(a: AnnouncementLike, now: Date): boolean {
	if (a.withdrawnAt) return false;
	if (a.endsAt && now.getTime() >= a.endsAt.getTime()) return false;
	return now.getTime() >= visibleFrom(a).getTime();
}

/** Zeitfenster plausibel: Ende nach Beginn, höchstens 90 Tage lang. */
export function windowError(
	startsAt: Date,
	endsAt: Date | null,
): "ends_before_start" | "too_long" | null {
	if (!endsAt) return null;
	if (endsAt.getTime() <= startsAt.getTime()) return "ends_before_start";
	if (endsAt.getTime() - startsAt.getTime() > 90 * 24 * 60 * 60 * 1000)
		return "too_long";
	return null;
}

/** Vorlagen zum Ausfüllen (Du-Form, ohne Geviertstrich). */
export const ANNOUNCEMENT_TEMPLATES: Record<
	"maintenance" | "incident" | "update",
	{ kind: AnnouncementKind; title: string; body: string }
> = {
	maintenance: {
		kind: "maintenance",
		title: "Wartung am [Datum]",
		body: "Am [Datum] von [Beginn] bis [Ende] Uhr ist Klick wegen Wartungsarbeiten kurz nicht erreichbar. Deine Daten bleiben unverändert. Plane Fristen so, dass sie nicht in dieses Fenster fallen.",
	},
	incident: {
		kind: "incident",
		title: "Sicherheitsvorfall bei Klick",
		body: "Am [Datum] hat Klick einen Sicherheitsvorfall festgestellt. Betroffen: [was]. Möglicherweise betroffene Daten: [welche]. Bereits getan: [Maßnahmen]. Was du tun solltest: [Empfehlung]. Ansprechpartner: [Name, Kontakt]. Bitte nimm diese Mitteilung zur Kenntnis.",
	},
	update: {
		kind: "info",
		title: "Neu in Klick: [Funktion]",
		body: "Ab sofort kannst du [Funktion]. Du findest sie unter [Ort]. Mehr dazu in der Hilfe.",
	},
};
