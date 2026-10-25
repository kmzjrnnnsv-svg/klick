import { and, asc, eq, ne } from "drizzle-orm";
import { risks } from "@/db/schema";
import type { RiskMethod } from "@/db/schema/platform";
import { userNames } from "@/lib/compliance/queries";
import { assessRisk } from "@/lib/compliance/risk";
import type { DocBlock } from "@/lib/export/doc-model";
import { orgRiskMethod } from "@/lib/org/queries";
import { fmtDay } from "../generate/doc";
import { generator } from "../generate/types";
import { ZONE_DE } from "./risikomethodik";

// NW-RISIKOBEURTEILUNG: Risikoregister mit Brutto-/Nettobewertung nach der
// Methodik der Organisation (ISO 27001 6.1.2, 8.2)
export type RisikobeurteilungFacts = {
	method: RiskMethod;
	risks: {
		code: string;
		title: string;
		category: string;
		owner: string | null;
		likelihood: number;
		impact: number;
		residualLikelihood: number | null;
		residualImpact: number | null;
		treatment: string;
		status: string;
		reviewAt: string | null;
		acceptedBy: string | null;
		acceptedAt: string | null;
	}[];
};

export const RISK_CATEGORY_DE: Record<string, string> = {
	strategic: "strategisch",
	operational: "operationell",
	ict_cyber: "IKT / Cyber",
	compliance_legal: "Compliance / Recht",
	financial: "finanziell",
	third_party: "Dritte",
	aml_fraud: "AML / Betrug",
	custody_keys: "Verwahrung / Schlüssel",
	market_liquidity: "Markt / Liquidität",
};
export const TREATMENT_DE: Record<string, string> = {
	mitigate: "mindern",
	accept: "akzeptieren",
	transfer: "übertragen",
	avoid: "vermeiden",
};
const STATUS_DE: Record<string, string> = {
	open: "offen",
	in_treatment: "in Behandlung",
	accepted: "akzeptiert",
	closed: "geschlossen",
};

export function buildRisikobeurteilung(
	f: RisikobeurteilungFacts,
	ctx: { today: string },
) {
	const assessed = f.risks.map((r) => ({
		r,
		a: assessRisk({ id: r.code, ...r }, f.method),
	}));
	const active = assessed.filter((x) => x.r.status !== "closed");
	const byZone = (z: keyof typeof ZONE_DE) =>
		active.filter((x) => x.a.effective.zone === z).length;
	const reviewOverdue = active.filter(
		(x) => x.r.reviewAt && x.r.reviewAt < ctx.today,
	).length;
	const point = (p: { likelihood: number; impact: number; score: number }) =>
		`EW ${p.likelihood}, SH ${p.impact}: ${p.score}`;
	const blocks: DocBlock[] = [
		{
			type: "paragraph",
			text: "Bewertet wird nach der Risikomethodik der Organisation: Brutto vor, Netto nach den umgesetzten Maßnahmen. Gesteuert wird nach dem Nettowert, solange er bewertet ist.",
		},
		{
			type: "keyValue",
			items: [
				["Risiken (nicht geschlossen)", String(active.length)],
				[`davon ${ZONE_DE.acceptable}`, String(byZone("acceptable"))],
				[`davon ${ZONE_DE.tolerable}`, String(byZone("tolerable"))],
				[`davon ${ZONE_DE.unacceptable}`, String(byZone("unacceptable"))],
				["Überprüfung überfällig", String(reviewOverdue)],
			],
		},
		{ type: "heading", level: 1, text: "Risikoregister" },
		{
			type: "table",
			columns: [
				{ label: "Nr.", width: 9 },
				{ label: "Risiko", width: 26 },
				{ label: "Kategorie", width: 13 },
				{ label: "Brutto", width: 11 },
				{ label: "Netto", width: 11 },
				{ label: "Klasse / Zone", width: 14 },
				{ label: "Behandlung / Status", width: 14 },
				{ label: "Überprüfung", width: 11 },
			],
			rows: assessed.map(({ r, a }) => [
				r.code,
				`${r.title}${r.owner ? `\nVerantwortlich: ${r.owner}` : ""}`,
				RISK_CATEGORY_DE[r.category] ?? r.category,
				point(a.inherent),
				a.residual ? point(a.residual) : "nicht bewertet",
				`${a.effective.cls.label}\n${ZONE_DE[a.effective.zone]}`,
				`${TREATMENT_DE[r.treatment] ?? r.treatment}\n${STATUS_DE[r.status] ?? r.status}`,
				fmtDay(r.reviewAt),
			]),
			empty: "Keine Risiken erfasst.",
		},
	];
	const accepted = f.risks.filter((r) => r.acceptedAt);
	if (accepted.length > 0)
		blocks.push(
			{ type: "heading", level: 1, text: "Akzeptierte Risiken" },
			{
				type: "table",
				columns: [
					{ label: "Nr.", width: 10 },
					{ label: "Risiko", width: 40 },
					{ label: "Akzeptiert von", width: 25 },
					{ label: "am", width: 14 },
				],
				rows: accepted.map((r) => [
					r.code,
					r.title,
					r.acceptedBy ?? "—",
					fmtDay(r.acceptedAt),
				]),
			},
		);
	return { blocks };
}

export const risikobeurteilung = generator<RisikobeurteilungFacts>({
	code: "NW-RISIKOBEURTEILUNG",
	async load(tx, orgId) {
		const method = await orgRiskMethod(tx, orgId);
		const rows = await tx
			.select()
			.from(risks)
			.where(and(eq(risks.organizationId, orgId), ne(risks.status, "proposed")))
			.orderBy(asc(risks.code));
		const names = await userNames(
			tx,
			rows.flatMap((r) => [r.ownerUserId, r.acceptedByUserId]),
		);
		const name = (id: string | null) => (id ? (names.get(id) ?? null) : null);
		return {
			method,
			risks: rows.map((r) => ({
				code: r.code,
				title: r.title,
				category: r.category,
				owner: name(r.ownerUserId),
				likelihood: r.likelihood,
				impact: r.impact,
				residualLikelihood: r.residualLikelihood,
				residualImpact: r.residualImpact,
				treatment: r.treatment,
				status: r.status,
				reviewAt: r.reviewAt,
				acceptedBy: name(r.acceptedByUserId),
				acceptedAt: r.acceptedAt
					? r.acceptedAt.toISOString().slice(0, 10)
					: null,
			})),
		};
	},
	build: buildRisikobeurteilung,
});
