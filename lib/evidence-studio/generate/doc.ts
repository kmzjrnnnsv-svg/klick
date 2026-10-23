import { createHash } from "node:crypto";
import { REQUIREMENT_BY_KEY } from "@/lib/compliance/catalog";
import type { EvidenceKind } from "@/lib/compliance/catalog/evidence-kinds";
import { REQUIRED_FUNCTIONS } from "@/lib/compliance/catalog/required-functions";
import { shortFrameworkName } from "@/lib/compliance/framework-names";
import type { DocBlock, DocModel } from "@/lib/export/doc-model";

// Erzeugte Nachweise (pure): Schnappschuss → Prüfsumme, Builder-Abschnitte →
// vollständiges Dokument mit Kopf, „Belegt“, Unterschriften und Fuß.

export type Snapshot<F = unknown> = {
	v: 1;
	kind: string;
	entityId: string | null;
	facts: F;
};

// Schlüssel sortiert, ohne undefined — gleiche Daten, gleiche Prüfsumme
export function canonicalJson(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value);
	if (Array.isArray(value))
		return `[${value.map((v) => (v === undefined ? "null" : canonicalJson(v))).join(",")}]`;
	const obj = value as Record<string, unknown>;
	return `{${Object.keys(obj)
		.filter((k) => obj[k] !== undefined)
		.sort()
		.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
		.join(",")}}`;
}

export const contentHash = (snapshot: Snapshot): string =>
	createHash("sha256").update(canonicalJson(snapshot)).digest("hex");

export const functionLabel = (f: string): string =>
	REQUIRED_FUNCTIONS.find((x) => x.function === f)?.title ??
	(f === "department_head" ? "Bereichsleitung" : f);

export function requirementLabel(key: string): string {
	const r = REQUIREMENT_BY_KEY.get(key);
	const [fw, code] = [
		key.slice(0, key.indexOf(":")),
		key.slice(key.indexOf(":") + 1),
	];
	return r
		? `${shortFrameworkName(fw)} ${code} – ${r.title}`
		: `${shortFrameworkName(fw)} ${code}`;
}

const fmt = new Intl.DateTimeFormat("de-DE", {
	dateStyle: "medium",
	timeZone: "Europe/Berlin",
});
export const fmtDay = (iso: string | null | undefined): string =>
	iso ? fmt.format(new Date(`${iso.slice(0, 10)}T12:00:00Z`)) : "—";

export type SignerSlot = {
	function: string;
	mode: "all" | "any";
	holders: string[];
};

export function assembleDoc(input: {
	kind: Pick<EvidenceKind, "code" | "title" | "purpose" | "requirements">;
	org: string;
	today: string;
	version: number;
	evidenceId: string;
	contentSha256: string;
	title?: string;
	subtitle?: string;
	blocks: DocBlock[];
	signers: SignerSlot[];
}): DocModel {
	const signerBlocks: DocBlock[] =
		input.signers.length === 0
			? []
			: [
					{ type: "heading", level: 1, text: "Freigabe" },
					{
						type: "signatures",
						signers: input.signers.flatMap((s) =>
							s.mode === "all" && s.holders.length > 0
								? s.holders.map((h) => ({
										role: functionLabel(s.function),
										name: h,
									}))
								: [
										{
											role: functionLabel(s.function),
											name:
												s.holders.length > 0
													? s.holders.join(" oder ")
													: "(Funktion nicht besetzt)",
										},
									],
						),
					},
				];
	return {
		title: input.title ?? input.kind.title,
		subtitle: input.subtitle ?? input.kind.purpose,
		org: input.org,
		meta: [
			["Stand", fmtDay(input.today)],
			["Version", String(input.version)],
			["Nachweis", `${input.kind.code} · ${input.evidenceId}`],
			["Prüfsumme (Inhalt)", input.contentSha256],
		],
		blocks: [
			...input.blocks,
			{ type: "heading", level: 1, text: "Belegt" },
			{
				type: "list",
				items: input.kind.requirements.map(requirementLabel),
			},
			...signerBlocks,
		],
		footer: `Erzeugt mit Klick · ${input.kind.code} v${input.version} · Prüfsumme ${input.contentSha256.slice(0, 16)}…`,
	};
}
