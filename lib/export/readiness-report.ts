import type {
	BlockerKind,
	BlockerSeverity,
	ReadinessResult,
	ReadinessVerdict,
} from "@/lib/compliance/readiness";
import { READINESS_POLICY } from "@/lib/compliance/readiness";

// Prüfungsreife-Bericht (Markdown) — Lieferobjekt für Beratung und
// Geschäftsleitung: Ergebnis, Kennzahlen, Maßnahmen in Reihenfolge, Methode.
// Rein; die Route lädt die Daten und hängt die Export-Kennzeichnung an.

const VERDICT: Record<ReadinessVerdict, string> = {
	ready: "prüfungsbereit",
	almost: "fast bereit",
	not_ready: "noch nicht bereit",
	n_a: "nicht bewertbar",
};
const SEVERITY: Record<BlockerSeverity, string> = {
	critical: "kritisch",
	high: "hoch",
	medium: "mittel",
	low: "gering",
};
const KIND: Record<BlockerKind, string> = {
	control_not_implemented: "Control umsetzen",
	evidence_missing: "Nachweis hinterlegen",
	test_missing: "Wirksamkeit testen",
	test_failed: "Test fehlgeschlagen – nachbessern",
	document_missing: "Pflichtdokument erstellen",
	document_not_approved: "Dokument freigeben",
	document_review_overdue: "Dokument überprüfen",
	nc_open: "Abweichung schließen",
	finding_open: "Audit-Finding bearbeiten",
	pbc_open: "Prüferanfrage beantworten",
	pbc_rejected: "Abgelehnte Prüferanfrage nachreichen",
	product_gap: "Produktpflicht erfüllen",
	security_finding: "Sicherheitsbefund beheben",
	governance_gap: "Freigabe-Pflicht abdecken",
};

const cell = (v: unknown) =>
	v === null || v === undefined
		? ""
		: String(v).replaceAll("|", "\\|").replaceAll(/\r?\n/g, " ");
const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n)} %`);

export function buildReadinessMarkdown(input: {
	orgName: string;
	frameworkName: string;
	result: ReadinessResult;
	sectionTitles?: Record<string, string>;
	author?: string;
	generatedAt?: Date;
}): string {
	const r = input.result;
	const at = input.generatedAt ?? new Date();
	const lines: string[] = [
		`# Prüfungsreife: ${input.frameworkName}`,
		"",
		`| | |`,
		`|---|---|`,
		`| Organisation | ${cell(input.orgName)} |`,
		`| Stichtag | ${r.asOf} |`,
		`| Erstellt | ${at.toISOString().slice(0, 10)}${input.author ? ` · ${cell(input.author)}` : ""} |`,
		`| Reifegrad | **${r.score ?? "—"} / 100** – ${VERDICT[r.verdict]} |`,
		`| Kritische Punkte | ${r.criticalBlockers} |`,
		"",
		"## Ergebnis",
		"",
		`Von ${r.applicable} anwendbaren Anforderungen sind ${r.counts.covered} abgedeckt, ${r.counts.partial} teilweise und ${r.counts.open} offen.`,
		"",
		"| Dimension | Stand |",
		"|---|---|",
		`| Abdeckung (umgesetzt laut Status) | ${pct(r.dimensions.coverage)} |`,
		`| Nachweise (gültig am Stichtag) | ${pct(r.dimensions.evidence)} |`,
		`| Wirksamkeitstests (frisch, bestanden) | ${pct(r.dimensions.tests)} |`,
		`| Pflichtdokumente (freigegeben, Review aktuell) | ${pct(r.dimensions.documents)} |`,
		`| Abzug offene Punkte | −${r.penalty.total} (Abweichungen ${r.penalty.nonconformities}, Findings ${r.penalty.findings}, Sicherheitsbefunde ${r.penalty.security}) |`,
		"",
		"## Maßnahmen bis zur Prüfung",
		"",
	];
	if (r.blockers.length === 0) {
		lines.push("Keine offenen Punkte.", "");
	} else {
		lines.push(
			"Reihenfolge nach Schwere und Wirkung; „Punkte“ = Änderung am Reifegrad, wenn der Schritt erledigt ist.",
			"",
			"| # | Schwere | Maßnahme | Betrifft | Punkte | Fällig |",
			"|---|---|---|---|---|---|",
		);
		r.blockers.forEach((b, i) => {
			lines.push(
				`| ${i + 1} | ${SEVERITY[b.severity]} | ${KIND[b.kind]} | ${cell(b.label)}${b.requirements > 0 ? ` (${b.requirements} Anf.)` : ""} | ${b.gain > 0 ? `+${b.gain.toLocaleString("de-DE")}` : ""} | ${b.dueAt ?? ""} |`,
			);
		});
		lines.push("");
	}
	if (r.bySection.length > 1) {
		lines.push(
			"## Reifegrad je Abschnitt",
			"",
			"| Abschnitt | Anforderungen | Reifegrad |",
			"|---|---|---|",
		);
		for (const s of r.bySection)
			lines.push(
				`| ${cell(s.sectionCode)} ${cell(input.sectionTitles?.[s.sectionCode] ?? "")} | ${s.applicable} | ${s.score} |`,
			);
		lines.push("");
	}
	const p = READINESS_POLICY;
	lines.push(
		"## Methode",
		"",
		"Je anwendbarer Anforderung zählt der Abdeckungsstatus (abgedeckt 1, teilweise 0,5, offen 0), aufgewertet um gültige Nachweise (+0,3) und frische, bestandene Wirksamkeitstests (+0,2) der tragenden Controls: Umgesetzt, aber nicht belegt ergibt die Hälfte.",
		`Gesamt = ${p.weightCoverage * 100} % Anforderungen + ${p.weightDocs * 100} % Pflichtdokumente, minus Abzüge für offene Abweichungen (max. ${p.penaltyCaps.nonconformities}), Audit-Findings (max. ${p.penaltyCaps.findings}) und Sicherheitsbefunde (max. ${p.penaltyCaps.security}). Tests gelten ${p.testMaxAgeMonths} Monate. Bereit ab ${p.thresholds.ready} ohne kritische Punkte, fast bereit ab ${p.thresholds.almost}.`,
		"",
		"_Selbsteinschätzung auf Basis der in Klick erfassten Daten – kein Testat und keine Rechtsberatung._",
		"",
	);
	return lines.join("\n");
}
