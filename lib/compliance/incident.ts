import type { IncidentRegime } from "@/db/schema/enums";

// Vorfall-Klassifizierung und Meldefristen — reine Funktionen, in der Action
// berechnet (nie im Job).
//
// DORA (RTS 2024/1772 vereinfacht, RTS 2025/301, ITS 2025/302):
//   Erstmeldung      ≤ 4 h nach Einstufung als schwerwiegend, spätestens
//                    24 h nach Kenntnis → min(classifiedAt + 4 h, awareAt + 24 h)
//   Zwischenbericht  ≤ 72 h nach Abgabe der Erstmeldung
//   Abschlussbericht ≤ 1 Monat nach Abgabe des Zwischenberichts
//   Solange ein Bericht nicht abgegeben ist, wird ab der Soll-Frist projiziert.
// NIS2 (Art. 23): Frühwarnung aware + 24 h, Meldung aware + 72 h,
//   Abschluss aware + 1 Monat (Zwischenbericht auf Anfrage).
// DSGVO (Art. 33): Meldung ≤ 72 h nach Kenntnis; Abschluss/Nachreichung
//   ohne feste Frist → kein finalDueAt.
// ZAG § 54 läuft über affectsPayments auf der DORA-Uhr (Art. 23).

const H = 60 * 60 * 1000;

export type DoraCriteria = {
	criticalServicesAffected?: boolean;
	maliciousAccess?: boolean;
	clientsAffected?: number;
	clientsAffectedPct?: number;
	durationHours?: number;
	downtimeHours?: number;
	geographicSpread?: boolean; // ≥ 2 Mitgliedstaaten
	dataLoss?: boolean; // Integrität/Vertraulichkeit/Verfügbarkeit von Daten
	reputationalImpact?: boolean;
	economicImpactEur?: number;
};

export type Classification = "major" | "significant" | "minor";

export type ClassificationResult = {
	classification: Classification;
	reasons: string[];
	thresholdsMet: number;
};

// Vereinfachte Abbildung der 7 Kriterien: schwerwiegend, wenn kritische
// Dienste betroffen UND (böswilliger Zugriff ODER ≥ 2 weitere Schwellen).
export function classifyDoraIncident(c: DoraCriteria): ClassificationResult {
	const reasons: string[] = [];
	let thresholds = 0;
	const hit = (cond: boolean | undefined, reason: string) => {
		if (cond) {
			thresholds += 1;
			reasons.push(reason);
		}
	};
	hit(
		(c.clientsAffected ?? 0) >= 100_000 || (c.clientsAffectedPct ?? 0) >= 10,
		"Kunden: ≥ 10 % oder ≥ 100 000 betroffen",
	);
	hit(
		(c.durationHours ?? 0) > 24 || (c.downtimeHours ?? 0) > 2,
		"Dauer > 24 h oder Ausfall > 2 h",
	);
	hit(c.geographicSpread, "Geografische Ausbreitung in ≥ 2 Mitgliedstaaten");
	hit(
		c.dataLoss,
		"Datenverlust (Verfügbarkeit, Authentizität, Integrität, Vertraulichkeit)",
	);
	hit(c.reputationalImpact, "Reputationsauswirkung");
	hit(
		(c.economicImpactEur ?? 0) > 100_000,
		"Wirtschaftliche Auswirkung > 100 000 €",
	);

	if (c.criticalServicesAffected) {
		if (c.maliciousAccess) {
			return {
				classification: "major",
				reasons: [
					"Kritische Dienste betroffen",
					"Böswilliger, unbefugter Zugriff",
					...reasons,
				],
				thresholdsMet: thresholds,
			};
		}
		if (thresholds >= 2) {
			return {
				classification: "major",
				reasons: ["Kritische Dienste betroffen", ...reasons],
				thresholdsMet: thresholds,
			};
		}
		return {
			classification: thresholds >= 1 ? "significant" : "minor",
			reasons: ["Kritische Dienste betroffen", ...reasons],
			thresholdsMet: thresholds,
		};
	}
	return {
		classification: thresholds >= 2 ? "significant" : "minor",
		reasons,
		thresholdsMet: thresholds,
	};
}

export type Nis2Criteria = {
	severeOperationalDisruption?: boolean;
	financialLoss?: boolean;
	affectsOthers?: boolean; // erheblicher materieller/immaterieller Schaden für andere
};

// Art. 23 Abs. 3: erheblich, wenn schwerwiegende Betriebsstörung/finanzieller
// Verlust ODER erheblicher Schaden für andere natürliche/juristische Personen.
export function classifyNis2Incident(c: Nis2Criteria): ClassificationResult {
	const reasons: string[] = [];
	if (c.severeOperationalDisruption)
		reasons.push("Schwerwiegende Betriebsstörung");
	if (c.financialLoss) reasons.push("Finanzieller Verlust");
	if (c.affectsOthers) reasons.push("Erheblicher Schaden für Dritte");
	return {
		classification: reasons.length > 0 ? "significant" : "minor",
		reasons,
		thresholdsMet: reasons.length,
	};
}

export type DeadlineInput = {
	awareAt: Date;
	classifiedAt?: Date | null;
	initialReportedAt?: Date | null;
	intermediateReportedAt?: Date | null;
};

export type Deadlines = {
	regime: IncidentRegime;
	labels: {
		initial: string;
		intermediate: string | null;
		final: string | null;
	};
	earlyWarningAt: Date | null;
	initialDueAt: Date;
	intermediateDueAt: Date | null;
	finalDueAt: Date | null;
	// true, wenn Folgefristen von noch nicht abgegebenen Berichten projiziert sind
	projected: boolean;
};

function addMonth(d: Date): Date {
	const out = new Date(d);
	out.setMonth(out.getMonth() + 1);
	return out;
}

export function computeIncidentDeadlines(
	regime: IncidentRegime,
	input: DeadlineInput,
): Deadlines {
	const aware = input.awareAt;
	switch (regime) {
		case "dora": {
			const byClassification = input.classifiedAt
				? new Date(input.classifiedAt.getTime() + 4 * H)
				: null;
			const byAwareness = new Date(aware.getTime() + 24 * H);
			const initialDueAt =
				byClassification && byClassification < byAwareness
					? byClassification
					: byAwareness;
			const initialBase = input.initialReportedAt ?? initialDueAt;
			const intermediateDueAt = new Date(initialBase.getTime() + 72 * H);
			const intermediateBase =
				input.intermediateReportedAt ?? intermediateDueAt;
			const finalDueAt = addMonth(intermediateBase);
			return {
				regime,
				labels: {
					initial: "Erstmeldung",
					intermediate: "Zwischenbericht",
					final: "Abschlussbericht",
				},
				earlyWarningAt: null,
				initialDueAt,
				intermediateDueAt,
				finalDueAt,
				projected: !input.initialReportedAt || !input.intermediateReportedAt,
			};
		}
		case "nis2":
			return {
				regime,
				labels: {
					initial: "Frühwarnung",
					intermediate: "Meldung",
					final: "Abschlussbericht",
				},
				earlyWarningAt: new Date(aware.getTime() + 24 * H),
				initialDueAt: new Date(aware.getTime() + 24 * H),
				intermediateDueAt: new Date(aware.getTime() + 72 * H),
				finalDueAt: addMonth(aware),
				projected: false,
			};
		case "dsgvo":
			return {
				regime,
				labels: {
					initial: "Meldung an die Aufsichtsbehörde",
					intermediate: null,
					final: null,
				},
				earlyWarningAt: null,
				initialDueAt: new Date(aware.getTime() + 72 * H),
				intermediateDueAt: null,
				finalDueAt: null,
				projected: false,
			};
		case "gwg_sar":
			return {
				regime,
				labels: {
					initial: "Verdachtsmeldung an die FIU (unverzüglich)",
					intermediate: null,
					final: null,
				},
				earlyWarningAt: null,
				initialDueAt: new Date(aware.getTime() + 24 * H),
				intermediateDueAt: null,
				finalDueAt: null,
				projected: false,
			};
	}
}

export type ClockState = "due" | "soon" | "overdue" | "done";

export function clockState(
	dueAt: Date | null,
	reportedAt: Date | null | undefined,
	now: Date,
): ClockState | null {
	if (!dueAt) return null;
	if (reportedAt) return "done";
	if (now > dueAt) return "overdue";
	if (dueAt.getTime() - now.getTime() <= 2 * H) return "soon";
	return "due";
}

export function nextIncidentCode(
	existing: readonly string[],
	year = new Date().getFullYear(),
): string {
	let max = 0;
	const re = new RegExp(`^INC-${year}-(\\d+)$`);
	for (const c of existing) {
		const m = re.exec(c);
		if (m) max = Math.max(max, Number(m[1]));
	}
	return `INC-${year}-${String(max + 1).padStart(3, "0")}`;
}
