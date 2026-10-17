import type { RiskMethod } from "@/db/schema/platform";
import { assessRisk } from "@/lib/compliance/risk";
import { md } from "./respond";

// Risikoanalyse als Markdown-Bericht: Deckblatt, Methodik (Skalen, Anker,
// Klassen), Risiken mit allen Feldern der geführten Analyse, Maßnahmenplan,
// Historie. Rein — Daten lädt die Route.

export type RiskReportRisk = {
	id: string;
	code: string;
	title: string;
	category: string;
	status: string;
	likelihood: number;
	impact: number;
	impactDetail: Record<string, number> | null;
	impactDescription: string | null;
	existingMeasures: string | null;
	protectionGoals: string[];
	treatment: string;
	treatmentNote: string | null;
	residualLikelihood: number | null;
	residualImpact: number | null;
	residualNote: string | null;
	ownerName: string | null;
	reviewAt: string | null;
	controls: string[];
};

export type RiskReportMeasure = {
	riskCode: string;
	title: string;
	ownerName: string | null;
	dueAt: string | null;
	costEur: number | null;
	status: string;
};

const GOAL: Record<string, string> = {
	confidentiality: "Vertraulichkeit",
	integrity: "Integrität",
	availability: "Verfügbarkeit",
	authenticity: "Authentizität",
};
const TREATMENT: Record<string, string> = {
	mitigate: "Reduzieren",
	accept: "Akzeptieren",
	transfer: "Übertragen",
	avoid: "Vermeiden",
};
const STATUS: Record<string, string> = {
	open: "offen",
	in_treatment: "in Behandlung",
	accepted: "akzeptiert",
	closed: "geschlossen",
	planned: "geplant",
	in_progress: "in Arbeit",
	done: "erledigt",
	dropped: "verworfen",
};
const ZONE: Record<string, string> = {
	acceptable: "akzeptabel",
	tolerable: "tolerierbar",
	unacceptable: "nicht tolerierbar",
};

export function buildRiskReportMarkdown(input: {
	orgName: string;
	author: string;
	method: RiskMethod;
	categoryLabel: (c: string) => string;
	risks: readonly RiskReportRisk[];
	measures: readonly RiskReportMeasure[];
	history: readonly { at: Date; actor: string; action: string; code: string }[];
	asOf?: Date;
}): string {
	const { method } = input;
	const asOf = input.asOf ?? new Date();
	const date = new Intl.DateTimeFormat("de-DE", {
		dateStyle: "long",
		timeZone: "Europe/Berlin",
	}).format(asOf);
	const op = method.aggregation === "sum" ? "+" : "×";
	const L: string[] = [];
	L.push(`# Risikoanalyse – ${input.orgName}`, "");
	L.push(`| | |`, `|---|---|`);
	L.push(`| Stand | ${md(date)} |`);
	L.push(`| Erstellt von | ${md(input.author)} |`);
	L.push(`| Risiken | ${input.risks.length} |`);
	L.push(`| Klassifizierung | vertraulich |`, "");

	const assessed = input.risks.map((r) => ({ r, a: assessRisk(r, method) }));
	L.push("## Übersicht je Risikoklasse", "");
	L.push("| Klasse | Wert | Zone | vor Behandlung | nach Behandlung |");
	L.push("|---|---|---|---|---|");
	method.classes.forEach((c, i) => {
		const before = assessed.filter((x) => x.a.inherent.cls.index === i).length;
		const after = assessed.filter((x) => x.a.effective.cls.index === i).length;
		L.push(
			`| ${md(c.label)} | ${c.min}–${c.max} | ${ZONE[c.zone]} | ${before} | ${after} |`,
		);
	});
	L.push("");

	L.push("## Methodik", "");
	L.push(
		`Risikowert = Eintrittswahrscheinlichkeit (EW) ${op} Schadenshöhe (SH). Die Schadenshöhe ist die höchste Stufe über alle bewerteten Schadensarten.`,
		"",
	);
	L.push("### Eintrittswahrscheinlichkeit", "");
	L.push("| Stufe | Bezeichnung | Anker |", "|---|---|---|");
	method.likelihood.forEach((l, i) => {
		L.push(`| ${i + 1} | ${md(l.label)} | ${md(l.anchor)} |`);
	});
	L.push("", "### Schadensarten", "");
	L.push(
		`| Schadensart | ${method.impact.map((x, i) => `${i + 1} · ${md(x)}`).join(" | ")} |`,
	);
	L.push(`|---|${method.impact.map(() => "---").join("|")}|`);
	for (const d of method.dimensions.filter((x) => x.enabled))
		L.push(`| ${md(d.label)} | ${d.anchors.map(md).join(" | ")} |`);
	L.push("", "### Risikoklassen", "");
	L.push("| Klasse | Wert | Zone | Bedeutung |", "|---|---|---|---|");
	for (const c of method.classes)
		L.push(
			`| ${md(c.label)} | ${c.min}–${c.max} | ${ZONE[c.zone]} | ${md(c.meaning)} |`,
		);
	L.push("");

	L.push("## Risiken", "");
	const dims = new Map(method.dimensions.map((d) => [d.key, d.label]));
	for (const { r, a } of assessed.sort(
		(x, y) =>
			y.a.effective.score - x.a.effective.score ||
			x.r.code.localeCompare(y.r.code),
	)) {
		L.push(`### ${r.code} · ${md(r.title)}`, "");
		L.push("| | |", "|---|---|");
		L.push(`| Kategorie | ${md(input.categoryLabel(r.category))} |`);
		L.push(`| Status | ${STATUS[r.status] ?? r.status} |`);
		if (r.impactDescription)
			L.push(`| Konkrete Auswirkung | ${md(r.impactDescription)} |`);
		if (r.existingMeasures)
			L.push(`| Bereits umgesetzt | ${md(r.existingMeasures)} |`);
		if (r.controls.length > 0)
			L.push(`| Mildernde Controls | ${md(r.controls.join(", "))} |`);
		if (r.protectionGoals.length > 0)
			L.push(
				`| Schutzziele | ${md(r.protectionGoals.map((g) => GOAL[g] ?? g).join(", "))} |`,
			);
		if (r.impactDetail && Object.keys(r.impactDetail).length > 0)
			L.push(
				`| Schaden je Art | ${md(
					Object.entries(r.impactDetail)
						.map(([k, v]) => `${dims.get(k) ?? k}: ${v}`)
						.join("; "),
				)} |`,
			);
		L.push(
			`| Risiko (EW ${op} SH) | ${r.likelihood} ${op} ${r.impact} = ${a.inherent.score} · ${md(a.inherent.cls.label)} (${ZONE[a.inherent.zone]}) |`,
		);
		L.push(`| Behandlung | ${TREATMENT[r.treatment] ?? r.treatment} |`);
		if (r.treatmentNote)
			L.push(`| Beschreibung / Begründung | ${md(r.treatmentNote)} |`);
		if (a.residual)
			L.push(
				`| Restrisiko | ${r.residualLikelihood} ${op} ${r.residualImpact} = ${a.residual.score} · ${md(a.residual.cls.label)} (${ZONE[a.residual.zone]}) |`,
			);
		if (r.residualNote)
			L.push(`| Beurteilung Restrisiko | ${md(r.residualNote)} |`);
		L.push(`| Verantwortlich | ${md(r.ownerName ?? "—")} |`);
		L.push(`| Nächste Überprüfung | ${md(r.reviewAt ?? "—")} |`, "");
	}
	if (input.risks.length === 0) L.push("Noch keine Risiken erfasst.", "");

	L.push("## Maßnahmenplan", "");
	if (input.measures.length === 0) L.push("Keine Maßnahmen geplant.", "");
	else {
		L.push(
			"| Risiko | Maßnahme | Verantwortlich | Umsetzen bis | Kosten | Status |",
		);
		L.push("|---|---|---|---|---|---|");
		for (const m of input.measures)
			L.push(
				`| ${md(m.riskCode)} | ${md(m.title)} | ${md(m.ownerName ?? "—")} | ${md(m.dueAt ?? "—")} | ${m.costEur != null ? `${m.costEur.toLocaleString("de-DE")} €` : "—"} | ${STATUS[m.status] ?? m.status} |`,
			);
		const total = input.measures.reduce((s, m) => s + (m.costEur ?? 0), 0);
		if (total > 0)
			L.push("", `Summe geplanter Kosten: ${total.toLocaleString("de-DE")} €`);
		L.push("");
	}

	L.push("## Historie", "");
	if (input.history.length === 0) L.push("Keine Einträge.", "");
	else {
		L.push("| Zeitpunkt | Person | Ereignis | Risiko |", "|---|---|---|---|");
		const fmt = new Intl.DateTimeFormat("de-DE", {
			dateStyle: "short",
			timeStyle: "short",
			timeZone: "Europe/Berlin",
		});
		for (const h of input.history)
			L.push(
				`| ${fmt.format(h.at)} | ${md(h.actor)} | ${md(h.action)} | ${md(h.code)} |`,
			);
		L.push("");
	}
	return L.join("\n");
}
