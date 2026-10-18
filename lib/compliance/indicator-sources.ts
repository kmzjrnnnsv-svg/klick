import { INDICATOR_TEMPLATES } from "./indicators";

// Messvorschläge aus Klick für Kennzahlen (C2) — pure. Für Vorlagen, deren
// Wert Klick selbst kennt (Schulungen, MFA, Befunde, Access-Reviews), wird
// ein Wert mit Grundlage vorgeschlagen; die Person bestätigt ihn beim
// Erfassen der Messung. Ohne Datengrundlage kein Vorschlag.

export type IndicatorData = {
	// aktueller Stand je Person × Pflichtschulung (currentTrainings)
	trainings: readonly { state: "done" | "due" | "overdue" | "planned" }[];
	// Mitglieder mit Grundrolle und ob ein zweiter Faktor eingerichtet ist
	members: readonly { role: string; mfa: boolean }[];
	// Sicherheitsbefunde (Schwere, Status, Frist)
	findings: readonly {
		severity: string;
		status: string;
		dueAt: Date | null;
	}[];
	// durchgeführte Access-Reviews (Testprogramm)
	accessReviews: readonly { testedAt: Date }[];
};

export type MeasurementSuggestion = {
	value: number;
	// Grundlage für den Hinweis (Textschlüssel + Werte)
	basis:
		| { key: "training"; done: number; total: number }
		| { key: "mfa"; withMfa: number; total: number }
		| { key: "findings"; n: number }
		| { key: "accessReviews"; quarters: number };
};

// Templates mit Datengrundlage in Klick
export const SOURCED_TEMPLATES = [
	"training_rate",
	"mfa_privileged",
	"unpatched_critical",
	"access_reviews_on_time",
] as const;

// Vorlage eines Ziels: gespeichert, sonst über den Vorlagentitel (Ziele aus
// Vorlagen vor C2)
export function objectiveTemplateKey(o: {
	templateKey: string | null;
	title: string;
}): string | null {
	return (
		o.templateKey ??
		INDICATOR_TEMPLATES.find((t) => t.title === o.title)?.key ??
		null
	);
}

const PRIVILEGED = new Set(["owner", "editor", "admin"]);
const OPEN_FINDING = new Set(["open", "in_progress"]);

const pct = (part: number, total: number) =>
	Math.round((part / total) * 1000) / 10;

// Quartal als fortlaufende Zahl (Jahr × 4 + Quartal)
const quarterIndex = (d: Date) =>
	d.getUTCFullYear() * 4 + Math.floor(d.getUTCMonth() / 3);

export function suggestMeasurement(
	templateKey: string | null | undefined,
	data: IndicatorData,
	now = new Date(),
): MeasurementSuggestion | null {
	switch (templateKey) {
		case "training_rate": {
			// fristgerecht = erledigt; überfällige zählen dagegen, noch nicht
			// fällige und geplante nicht
			const done = data.trainings.filter((x) => x.state === "done").length;
			const overdue = data.trainings.filter(
				(x) => x.state === "overdue",
			).length;
			const total = done + overdue;
			if (total === 0) return null;
			return {
				value: pct(done, total),
				basis: { key: "training", done, total },
			};
		}
		case "mfa_privileged": {
			const privileged = data.members.filter((m) => PRIVILEGED.has(m.role));
			if (privileged.length === 0) return null;
			const withMfa = privileged.filter((m) => m.mfa).length;
			return {
				value: pct(withMfa, privileged.length),
				basis: { key: "mfa", withMfa, total: privileged.length },
			};
		}
		case "unpatched_critical": {
			const n = data.findings.filter(
				(f) =>
					f.severity === "critical" &&
					OPEN_FINDING.has(f.status) &&
					f.dueAt !== null &&
					f.dueAt < now,
			).length;
			return { value: n, basis: { key: "findings", n } };
		}
		case "access_reviews_on_time": {
			// die letzten vier abgeschlossenen Quartale: in wie vielen gab es
			// mindestens ein Access-Review?
			const current = quarterIndex(now);
			const covered = new Set(
				data.accessReviews
					.map((r) => quarterIndex(r.testedAt))
					.filter((q) => q < current && q >= current - 4),
			).size;
			return {
				value: pct(covered, 4),
				basis: { key: "accessReviews", quarters: covered },
			};
		}
		default:
			return null;
	}
}
