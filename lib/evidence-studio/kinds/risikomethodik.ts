import type { RiskMethod, RiskZone } from "@/db/schema/platform";
import { appetiteFromMethod, scoreRange } from "@/lib/compliance/risk-method";
import type { DocBlock } from "@/lib/export/doc-model";
import { getOrgSettings, orgRiskMethod } from "@/lib/org/queries";
import { functionLabel } from "../generate/doc";
import { generator } from "../generate/types";

// NW-RISIKOMETHODIK: Rechenweg, Stufen mit Ankertexten, Schadensarten,
// Risikoklassen mit Zone und Freigabestufen, Risikoappetit (ISO 27001 6.1.2)
export type RisikomethodikFacts = {
	// eigene Methodik der Org (org_settings.riskMethod) oder Vorlage/Altmethode
	stored: boolean;
	method: RiskMethod;
};

export const ZONE_DE: Record<RiskZone, string> = {
	acceptable: "akzeptabel",
	tolerable: "tolerierbar",
	unacceptable: "nicht tolerierbar",
};

export function buildRisikomethodik(f: RisikomethodikFacts) {
	const m = f.method;
	const range = scoreRange(m);
	const appetite = appetiteFromMethod(m);
	const formula =
		m.aggregation === "sum"
			? "Eintrittswahrscheinlichkeit + Schadenshöhe"
			: "Eintrittswahrscheinlichkeit × Schadenshöhe";
	const blocks: DocBlock[] = [
		{
			type: "paragraph",
			text: "Die Methodik legt fest, wie Risiken identifiziert, bewertet und eingestuft werden, damit wiederholte Beurteilungen zu konsistenten, gültigen und vergleichbaren Ergebnissen führen.",
		},
		{
			type: "keyValue",
			items: [
				["Rechenweg", `Risikowert = ${formula}`],
				["Wertebereich", `${range.min} bis ${range.max}`],
				[
					"Risikoappetit",
					`akzeptabel bis ${appetite.acceptable}, tolerierbar bis ${appetite.tolerable}, darüber nicht tolerierbar`,
				],
				[
					"Grundlage",
					f.stored
						? "eigene Methodik der Organisation"
						: "Standardmethodik (Vorlage, nicht angepasst)",
				],
			],
		},
		{ type: "heading", level: 1, text: "Eintrittswahrscheinlichkeit" },
		{
			type: "table",
			columns: [
				{ label: "Stufe", width: 7 },
				{ label: "Bezeichnung", width: 20 },
				{ label: "Beschreibung", width: 60 },
			],
			rows: m.likelihood.map((l, i) => [String(i + 1), l.label, l.anchor]),
		},
		{ type: "heading", level: 1, text: "Schadenshöhe" },
		{
			type: "table",
			columns: [
				{ label: "Stufe", width: 7 },
				{ label: "Bezeichnung", width: 80 },
			],
			rows: m.impact.map((l, i) => [String(i + 1), l]),
		},
	];
	const dims = m.dimensions.filter((d) => d.enabled);
	if (dims.length > 0) {
		blocks.push(
			{ type: "heading", level: 1, text: "Schadensarten" },
			{
				type: "paragraph",
				text: "Je Schadensart wird eine Stufe bestimmt; die höchste Stufe ergibt die Schadenshöhe des Risikos.",
			},
		);
		for (const d of dims)
			blocks.push(
				{ type: "heading", level: 2, text: d.label },
				{
					type: "table",
					columns: [
						{ label: "Stufe", width: 7 },
						{ label: "Beschreibung", width: 80 },
					],
					rows: d.anchors.map((a, i) => [String(i + 1), a]),
				},
			);
	}
	blocks.push(
		{ type: "heading", level: 1, text: "Risikoklassen" },
		{
			type: "table",
			columns: [
				{ label: "Klasse", width: 16 },
				{ label: "Wertebereich", width: 12 },
				{ label: "Zone", width: 14 },
				{ label: "Bedeutung", width: 34 },
				{ label: "Akzeptanz durch", width: 24 },
			],
			rows: m.classes.map((c) => [
				c.label,
				c.min === c.max ? String(c.min) : `${c.min}–${c.max}`,
				ZONE_DE[c.zone],
				c.meaning,
				c.acceptance === undefined
					? c.zone === "unacceptable"
						? "Freigabe Risikoakzeptanz"
						: "verantwortliche Person"
					: c.acceptance.length === 0
						? "verantwortliche Person"
						: c.acceptance.map(functionLabel).join(" → "),
			]),
			empty: "Keine Risikoklassen festgelegt.",
		},
	);
	return { blocks };
}

export const risikomethodik = generator<RisikomethodikFacts>({
	code: "NW-RISIKOMETHODIK",
	async load(tx, orgId) {
		const settings = await getOrgSettings(tx, orgId);
		const method = await orgRiskMethod(tx, orgId, settings);
		return { stored: Boolean(settings?.riskMethod), method };
	},
	build: buildRisikomethodik,
});
