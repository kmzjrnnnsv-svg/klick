import type { OrgRoleLegal } from "@/db/schema/enums";
import type { Product } from "@/db/schema/products";
import type { ReadinessBlocker } from "./readiness";

// CRA je Produkt — reine Ableitungen aus dem Produktregister: welches
// Konformitätsverfahren gilt, ob der Unterstützungszeitraum trägt, was bis zur
// Marktreife fehlt. Nichts davon wird gespeichert; Readiness und Produktseite
// rechnen bei jedem Aufruf neu. Stichtage: Meldepflichten (Art. 14) seit
// 11.09.2026, alles Übrige ab 11.12.2027 (Art. 71).

export const CRA_REPORTING_FROM = "2026-09-11";
export const CRA_APPLIES_FROM = "2027-12-11";

const DAY = 86_400_000;

export type ProductForCra = Pick<
	Product,
	| "id"
	| "code"
	| "name"
	| "role"
	| "craInScope"
	| "craClass"
	| "classReason"
	| "isFoss"
	| "harmonisedStandards"
	| "placedOnMarketAt"
	| "supportUntil"
	| "supportReason"
	| "vulnContact"
	| "sbomSummary"
	| "riskDocumentId"
	| "techDocDocumentId"
	| "declarationAt"
	| "ceMarked"
	| "notifiedBody"
	| "status"
>;

// ── Konformitätsverfahren (Art. 32) ─────────────────────────────────────────

export type ConformityRoute = {
	route: "none" | "A" | "BC_H" | "EUCC";
	thirdParty: boolean;
	label: string;
	basis: string;
};

export function conformityRoute(
	p: Pick<
		ProductForCra,
		"role" | "craClass" | "isFoss" | "harmonisedStandards"
	>,
): ConformityRoute {
	if (p.role === "importer" || p.role === "distributor")
		return {
			route: "none",
			thirdParty: false,
			label:
				"Kein eigenes Verfahren — prüfen, dass der Hersteller es durchgeführt hat",
			basis: p.role === "importer" ? "Art. 19" : "Art. 20",
		};
	if (p.role === "oss_steward")
		return {
			route: "none",
			thirdParty: false,
			label:
				"Kein Konformitätsverfahren — Cybersicherheitsstrategie und Zusammenarbeit mit Marktüberwachung",
			basis: "Art. 24",
		};
	switch (p.craClass) {
		case "default":
			return {
				route: "A",
				thirdParty: false,
				label: "Interne Kontrolle (Modul A) — Selbstbewertung",
				basis: "Art. 32 Abs. 1, Anhang VIII Teil I",
			};
		case "important_1":
			if (p.harmonisedStandards)
				return {
					route: "A",
					thirdParty: false,
					label:
						"Interne Kontrolle (Modul A) — zulässig, weil harmonisierte Normen vollständig angewandt sind",
					basis: "Art. 32 Abs. 2",
				};
			if (p.isFoss)
				return {
					route: "A",
					thirdParty: false,
					label:
						"Interne Kontrolle (Modul A) — zulässig für freie Software mit öffentlicher technischer Dokumentation",
					basis: "Art. 32 Abs. 5",
				};
			return {
				route: "BC_H",
				thirdParty: true,
				label:
					"Benannte Stelle: EU-Baumusterprüfung + Konformität mit der Bauart (B + C) oder umfassende Qualitätssicherung (H)",
				basis: "Art. 32 Abs. 2",
			};
		case "important_2":
			if (p.isFoss)
				return {
					route: "A",
					thirdParty: false,
					label:
						"Interne Kontrolle (Modul A) — zulässig für freie Software mit öffentlicher technischer Dokumentation",
					basis: "Art. 32 Abs. 5",
				};
			return {
				route: "BC_H",
				thirdParty: true,
				label:
					"Benannte Stelle: B + C, H oder europäische Cybersicherheitszertifizierung (mind. „substanziell“)",
				basis: "Art. 32 Abs. 3",
			};
		case "critical":
			return {
				route: "EUCC",
				thirdParty: true,
				label:
					"Europäische Cybersicherheitszertifizierung, sofern per delegiertem Rechtsakt verlangt — sonst wie Klasse II",
				basis: "Art. 8 Abs. 1, Art. 32 Abs. 4",
			};
	}
}

// ── Unterstützungszeitraum (Art. 13 Abs. 8) ────────────────────────────────

export type SupportCheck = {
	state: "missing" | "ended" | "too_short" | "ending_soon" | "ok";
	years: number | null;
	daysLeft: number | null;
};

export function supportPeriodCheck(
	p: Pick<ProductForCra, "supportUntil" | "placedOnMarketAt" | "supportReason">,
	now: Date,
): SupportCheck {
	if (!p.supportUntil) return { state: "missing", years: null, daysLeft: null };
	const until = new Date(p.supportUntil);
	const start = p.placedOnMarketAt ? new Date(p.placedOnMarketAt) : now;
	const years =
		Math.round(((until.getTime() - start.getTime()) / (365.25 * DAY)) * 10) /
		10;
	const daysLeft = Math.ceil((until.getTime() - now.getTime()) / DAY);
	if (daysLeft < 0) return { state: "ended", years, daysLeft };
	// mind. fünf Jahre, kürzer nur mit Begründung (erwartete Nutzungsdauer)
	if (years < 5 && !p.supportReason?.trim())
		return { state: "too_short", years, daysLeft };
	if (daysLeft <= 365) return { state: "ending_soon", years, daysLeft };
	return { state: "ok", years, daysLeft };
}

// ── Checkliste je Produkt ──────────────────────────────────────────────────

export type CraCheckKey =
	| "scope"
	| "class"
	| "vuln_contact"
	| "risk_assessment"
	| "sbom"
	| "support"
	| "tech_doc"
	| "conformity"
	| "notified_body"
	| "supplier_docs";

export type CraCheck = {
	key: CraCheckKey;
	ok: boolean;
	severity: "critical" | "high" | "medium";
	// ab wann die Pflicht gilt; davor zählt der Punkt als Vorbereitung
	dueFrom: string;
	detail?: string;
};

export type ProductCraStatus = {
	state: "unassessed" | "out_of_scope" | "gaps" | "ready";
	checks: CraCheck[];
	done: number;
	total: number;
	percent: number;
	route: ConformityRoute;
	support: SupportCheck;
};

const SBOM_MAX_AGE_DAYS = 365;

export function productCraStatus(
	p: ProductForCra,
	now: Date,
): ProductCraStatus {
	const route = conformityRoute(p);
	const support = supportPeriodCheck(p, now);
	const checks: CraCheck[] = [
		{
			key: "scope",
			ok: p.craInScope !== null,
			severity: "critical",
			dueFrom: CRA_REPORTING_FROM,
		},
	];
	if (p.craInScope === false)
		return {
			state: "out_of_scope",
			checks,
			done: 1,
			total: 1,
			percent: 100,
			route,
			support,
		};
	checks.push({
		key: "class",
		ok: p.craClass === "default" || Boolean(p.classReason?.trim()),
		severity: "high",
		dueFrom: CRA_APPLIES_FROM,
	});
	if (p.role === "manufacturer") {
		const sbom = p.sbomSummary;
		const sbomAge = sbom?.generatedAt
			? Math.floor((now.getTime() - new Date(sbom.generatedAt).getTime()) / DAY)
			: null;
		checks.push(
			{
				key: "vuln_contact",
				ok: Boolean(p.vulnContact?.trim()),
				severity: "critical",
				dueFrom: CRA_REPORTING_FROM,
			},
			{
				key: "risk_assessment",
				ok: p.riskDocumentId !== null,
				severity: "critical",
				dueFrom: CRA_APPLIES_FROM,
			},
			{
				key: "sbom",
				ok:
					Boolean(sbom?.ok) &&
					(sbomAge === null || sbomAge <= SBOM_MAX_AGE_DAYS),
				severity: "high",
				dueFrom: CRA_APPLIES_FROM,
				detail: !sbom
					? "missing"
					: !sbom.ok
						? "incomplete"
						: sbomAge !== null && sbomAge > SBOM_MAX_AGE_DAYS
							? "stale"
							: undefined,
			},
			{
				key: "support",
				ok: support.state === "ok" || support.state === "ending_soon",
				severity: "high",
				dueFrom: CRA_APPLIES_FROM,
				detail: support.state,
			},
			{
				key: "tech_doc",
				ok: p.techDocDocumentId !== null,
				severity: "high",
				dueFrom: CRA_APPLIES_FROM,
			},
			{
				key: "conformity",
				ok: p.declarationAt !== null && p.ceMarked,
				severity: "high",
				dueFrom: CRA_APPLIES_FROM,
			},
		);
		if (route.thirdParty)
			checks.push({
				key: "notified_body",
				ok: Boolean(p.notifiedBody?.trim()),
				severity: "high",
				dueFrom: CRA_APPLIES_FROM,
			});
	} else if (p.role === "importer" || p.role === "distributor") {
		checks.push({
			key: "supplier_docs",
			ok: p.declarationAt !== null && p.ceMarked,
			severity: "high",
			dueFrom: CRA_APPLIES_FROM,
		});
	}
	const done = checks.filter((c) => c.ok).length;
	return {
		state:
			p.craInScope === null
				? "unassessed"
				: done === checks.length
					? "ready"
					: "gaps",
		checks,
		done,
		total: checks.length,
		percent: Math.round((done / checks.length) * 100),
		route,
		support,
	};
}

// Offene Produktpunkte als Blocker der Prüfungsreife (Rahmenwerk cra). Vor
// dem jeweiligen Stichtag zählt ein Punkt eine Stufe milder.
export const CRA_CHECK_LABEL: Record<CraCheckKey, string> = {
	scope: "Anwendungsbereich nicht bewertet",
	class: "Einstufung nicht begründet",
	vuln_contact: "Kontakt für Schwachstellenmeldungen fehlt",
	risk_assessment: "Risikobewertung fehlt",
	sbom: "SBOM fehlt, ist unvollständig oder veraltet",
	support: "Unterstützungszeitraum fehlt oder zu kurz",
	tech_doc: "Technische Dokumentation fehlt",
	conformity: "EU-Konformitätserklärung oder CE fehlt",
	notified_body: "Benannte Stelle nicht festgelegt",
	supplier_docs: "Herstellerunterlagen nicht geprüft",
};

const MILDER: Record<CraCheck["severity"], ReadinessBlocker["severity"]> = {
	critical: "high",
	high: "medium",
	medium: "low",
};

export function craBlockers(
	products: readonly ProductForCra[],
	asOf: Date,
): ReadinessBlocker[] {
	const out: ReadinessBlocker[] = [];
	for (const p of products) {
		if (p.status === "withdrawn") continue;
		const s = productCraStatus(p, asOf);
		for (const c of s.checks) {
			if (c.ok) continue;
			const due = asOf >= new Date(c.dueFrom);
			out.push({
				kind: "product_gap",
				severity: due ? c.severity : MILDER[c.severity],
				label: `${p.code} ${p.name}: ${CRA_CHECK_LABEL[c.key]}`,
				ref: `${p.id}:${c.key}`,
				href: `/produkte/${p.id}`,
				requirements: 0,
				gain: 0,
				dueAt: c.dueFrom,
			});
		}
	}
	return out;
}

// CRA-Rollen der Org aus dem Register: undefined = kein Produkt erfasst
// (alles Gewählte ist Arbeitsgegenstand), sonst die Rollen der Produkte im
// Anwendungsbereich (nicht bewertete zählen vorsichtshalber mit).
export function productRolesFrom(
	products: readonly Pick<ProductForCra, "role" | "craInScope" | "status">[],
): OrgRoleLegal[] | undefined {
	if (products.length === 0) return undefined;
	const roles = new Set<OrgRoleLegal>();
	for (const p of products) {
		if (p.status === "withdrawn" || p.craInScope === false) continue;
		roles.add(p.role);
	}
	return [...roles];
}

export function nextProductCode(existing: readonly string[]): string {
	let max = 0;
	for (const c of existing) {
		const m = /^PRD-(\d+)$/.exec(c);
		if (m) max = Math.max(max, Number(m[1]));
	}
	return `PRD-${String(max + 1).padStart(3, "0")}`;
}
