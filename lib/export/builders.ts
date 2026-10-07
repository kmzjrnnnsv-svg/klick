import type { RiskAppetite } from "@/db/schema/platform";
import {
	CONTROL_BY_CODE,
	EDGES_BY_REQUIREMENT,
	FRAMEWORK_BY_SLUG,
	REQUIREMENT_BY_KEY,
} from "@/lib/compliance/catalog";
import type { OrgCoverage } from "@/lib/compliance/queries";
import { assessRisk } from "@/lib/compliance/risk";
import { md } from "./respond";

// Geteilte Export-Bausteine: dieselbe SoA, Gap-Liste und Risikotabelle in
// Einzel-Exporten (/api/export/*) und im Prüfungspaket (ZIP). Reine Funktionen
// über den bereits geladenen Daten — keine DB-Zugriffe.

const STATUS_DE: Record<string, string> = {
	covered: "erfüllt",
	partial: "teilweise",
	open: "offen",
	not_applicable: "nicht anwendbar",
};

export function buildSoaMarkdown(
	cov: OrgCoverage,
	evidenceByControl: ReadonlyMap<string, number>,
	stamp: string,
): string | null {
	const iso = FRAMEWORK_BY_SLUG.get("iso27001");
	if (!iso || !cov.frameworks.includes("iso27001")) return null;
	const annexA = iso.requirements.filter((r) => r.code.startsWith("A."));
	const lines: string[] = [
		"# Erklärung zur Anwendbarkeit (Statement of Applicability)",
		"",
		`Stand ${stamp} · ISO/IEC 27001:2022 Klausel 6.1.3 d) · abgeleitet aus Anwendbarkeit, Control-Status und Nachweisen (Klick).`,
		"",
		"| Maßnahme | Titel | Anwendbar | Begründung | Umsetzende Controls (Status) | Nachweise | Status |",
		"|---|---|---|---|---|---|---|",
	];
	let applicable = 0;
	for (const r of annexA) {
		const key = `iso27001:${r.code}`;
		const status = cov.result.byRequirement.get(key) ?? "open";
		const detail = cov.applicabilityDetail.get(key);
		const isApplicable = status !== "not_applicable";
		if (isApplicable) applicable += 1;
		const edges = EDGES_BY_REQUIREMENT.get(key) ?? [];
		const controls = edges
			.map(
				(e) =>
					`${e.control} ${CONTROL_BY_CODE.get(e.control)?.title ?? ""} (${cov.implStatus.get(e.control) ?? "not_started"}${e.coverage === "partial" ? ", teilweise" : ""})`,
			)
			.join("; ");
		const evidence = edges.reduce(
			(s, e) => s + (evidenceByControl.get(e.control) ?? 0),
			0,
		);
		lines.push(
			`| ${md(r.code)} | ${md(r.title)} | ${isApplicable ? "ja" : "nein"} | ${md(detail?.note ?? (isApplicable ? "" : (detail?.source ?? "")))} | ${md(controls)} | ${evidence} | ${STATUS_DE[status] ?? status} |`,
		);
	}
	lines.push(
		"",
		`${annexA.length} Annex-A-Maßnahmen · ${applicable} anwendbar · ${annexA.length - applicable} ausgeschlossen (mit Begründung in requirement_applicability).`,
		"",
		"_Dieser Export ist Orientierung für Zertifizierung und Prüfung — kein Rechtsrat._",
	);
	return `${lines.join("\n")}\n`;
}

export const GAP_HEADER = [
	"rahmenwerk",
	"code",
	"anforderung",
	"domaene",
	"status",
	"anwendbarkeit_quelle",
	"anwendbarkeit_begruendung",
	"controls_status",
	"controls_titel",
] as const;

export function buildGapRows(
	cov: OrgCoverage,
	slugs: readonly string[],
): unknown[][] {
	const rows: unknown[][] = [];
	for (const slug of slugs) {
		for (const [key, status] of cov.result.byRequirement) {
			if (!key.startsWith(`${slug}:`)) continue;
			const req = REQUIREMENT_BY_KEY.get(key);
			if (!req) continue;
			const detail = cov.applicabilityDetail.get(key);
			const edges = EDGES_BY_REQUIREMENT.get(key) ?? [];
			rows.push([
				slug,
				req.code,
				req.title,
				req.domain,
				status,
				detail?.source ?? "default",
				detail?.note ?? "",
				edges
					.map(
						(e) =>
							`${e.control} (${cov.implStatus.get(e.control) ?? "not_started"}${e.coverage === "partial" ? ", teilweise" : ""})`,
					)
					.join(" | "),
				edges
					.map((e) => CONTROL_BY_CODE.get(e.control)?.title ?? "")
					.join(" | "),
			]);
		}
	}
	return rows;
}

export const RISK_HEADER = [
	"code",
	"titel",
	"kategorie",
	"status",
	"eintrittswahrscheinlichkeit",
	"auswirkung",
	"score",
	"band",
	"behandlung",
	"rest_eintrittswahrscheinlichkeit",
	"rest_auswirkung",
	"rest_score",
	"ueber_appetit",
	"verantwortlich",
	"review",
	"beschreibung",
] as const;

export type RiskExportRow = {
	id: string;
	code: string;
	title: string;
	category: string;
	status: string;
	likelihood: number;
	impact: number;
	treatment: string | null;
	residualLikelihood: number | null;
	residualImpact: number | null;
	reviewAt: string | null;
	description: string | null;
	names: { ownerUserId?: string | null };
};

export function buildRiskRows(
	rows: readonly RiskExportRow[],
	appetite: RiskAppetite,
): unknown[][] {
	return rows.map((r) => {
		const a = assessRisk(r, appetite);
		return [
			r.code,
			r.title,
			r.category,
			r.status,
			r.likelihood,
			r.impact,
			a.inherent.score,
			a.inherent.band,
			r.treatment ?? "",
			r.residualLikelihood ?? "",
			r.residualImpact ?? "",
			a.residual?.score ?? "",
			a.aboveAppetite ? "ja" : "nein",
			r.names.ownerUserId ?? "",
			r.reviewAt ?? "",
			r.description ?? "",
		];
	});
}
