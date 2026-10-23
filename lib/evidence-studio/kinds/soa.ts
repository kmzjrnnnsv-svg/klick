import {
	CONTROL_BY_CODE,
	EDGES_BY_REQUIREMENT,
	FRAMEWORK_BY_SLUG,
} from "@/lib/compliance/catalog";
import {
	listEvidenceWithControls,
	orgCoverage,
} from "@/lib/compliance/queries";
import type { DocBlock } from "@/lib/export/doc-model";
import { generator } from "../generate/types";

// NW-SOA: Erklärung zur Anwendbarkeit (ISO 27001 6.1.3 d) — je Annex-A-
// Maßnahme Anwendbarkeit mit Begründung, umsetzende Controls mit Stand und
// Zahl der Nachweise; abgeleitet wie der Export /api/export/soa.md
export type SoaFacts = {
	rows: {
		code: string;
		title: string;
		applicable: boolean;
		justification: string | null;
		status: string;
		controls: {
			code: string;
			title: string;
			status: string;
			partial: boolean;
		}[];
		evidence: number;
	}[];
};

const STATUS_DE: Record<string, string> = {
	covered: "erfüllt",
	partial: "teilweise",
	open: "offen",
	not_applicable: "nicht anwendbar",
};
const IMPL_DE: Record<string, string> = {
	not_started: "nicht begonnen",
	planned: "geplant",
	in_progress: "in Umsetzung",
	implemented: "umgesetzt",
	not_applicable: "entfällt",
};

export function buildSoa(f: SoaFacts) {
	const applicable = f.rows.filter((r) => r.applicable);
	const excluded = f.rows.filter((r) => !r.applicable);
	const blocks: DocBlock[] = [
		{
			type: "paragraph",
			text: "Die Erklärung zur Anwendbarkeit nennt für jede Maßnahme aus Anhang A, ob sie anwendbar ist, die Begründung für Einbeziehung oder Ausschluss und den Stand der Umsetzung. Sie ist aus Anwendbarkeit, Control-Status und Nachweisen in Klick abgeleitet.",
		},
		{
			type: "keyValue",
			items: [
				["Maßnahmen aus Anhang A", String(f.rows.length)],
				["anwendbar", String(applicable.length)],
				["ausgeschlossen", String(excluded.length)],
				[
					"erfüllt",
					String(applicable.filter((r) => r.status === "covered").length),
				],
				[
					"teilweise",
					String(applicable.filter((r) => r.status === "partial").length),
				],
				["offen", String(applicable.filter((r) => r.status === "open").length)],
			],
		},
		{ type: "heading", level: 1, text: "Maßnahmen" },
		{
			type: "table",
			columns: [
				{ label: "Nr.", width: 7 },
				{ label: "Maßnahme", width: 22 },
				{ label: "Anwendbar", width: 9 },
				{ label: "Begründung", width: 20 },
				{ label: "Umsetzende Controls", width: 28 },
				{ label: "Nachweise", width: 8 },
				{ label: "Stand", width: 10 },
			],
			rows: f.rows.map((r) => [
				r.code,
				r.title,
				r.applicable ? "ja" : "nein",
				r.justification ?? (r.applicable ? "" : "Begründung fehlt"),
				r.controls
					.map(
						(c) =>
							`${c.code} ${c.title} (${IMPL_DE[c.status] ?? c.status}${c.partial ? ", teilweise" : ""})`,
					)
					.join("\n"),
				String(r.evidence),
				STATUS_DE[r.status] ?? r.status,
			]),
		},
	];
	return { blocks };
}

export const soa = generator<SoaFacts>({
	code: "NW-SOA",
	dependsOnEvidence: true,
	async load(tx, orgId) {
		const cov = await orgCoverage(tx, orgId);
		const iso = FRAMEWORK_BY_SLUG.get("iso27001");
		if (!cov || !iso || !cov.frameworks.includes("iso27001")) return null;
		// Nachweise je Control — ohne die SoA selbst, sonst wäre jede neu
		// erzeugte SoA sofort veraltet
		const ev = await listEvidenceWithControls(tx, orgId);
		const evidenceByControl = new Map<string, number>();
		for (const e of ev)
			if (e.kindCode !== "NW-SOA")
				for (const code of e.controlCodes)
					evidenceByControl.set(code, (evidenceByControl.get(code) ?? 0) + 1);
		return {
			rows: iso.requirements
				.filter((r) => r.code.startsWith("A."))
				.map((r) => {
					const key = `iso27001:${r.code}`;
					const status = cov.result.byRequirement.get(key) ?? "open";
					const detail = cov.applicabilityDetail.get(key);
					const edges = EDGES_BY_REQUIREMENT.get(key) ?? [];
					return {
						code: r.code,
						title: r.title,
						applicable: status !== "not_applicable",
						justification: detail?.note ?? null,
						status,
						controls: edges.map((e) => ({
							code: e.control,
							title: CONTROL_BY_CODE.get(e.control)?.title ?? "",
							status: cov.implStatus.get(e.control) ?? "not_started",
							partial: e.coverage === "partial",
						})),
						evidence: edges.reduce(
							(s, e) => s + (evidenceByControl.get(e.control) ?? 0),
							0,
						),
					};
				}),
		};
	},
	build: buildSoa,
});
