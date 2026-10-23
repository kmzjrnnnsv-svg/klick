import { and, eq, ne } from "drizzle-orm";
import { processes } from "@/db/schema";
import { userNames } from "@/lib/compliance/queries";
import type { DocBlock } from "@/lib/export/doc-model";
import { generator } from "../generate/types";

// NW-PROZESSLANDKARTE: Prozesse nach Art mit Verantwortung, Kritikalität
// und Wiederanlaufzielen (ISO 27001 4.4, DORA Art. 8)
export type ProzesslandkarteFacts = {
	processes: {
		code: string;
		name: string;
		category: "core" | "support" | "management" | "control";
		parent: string | null;
		owner: string | null;
		criticality: "critical" | "important" | "standard";
		rtoHours: number | null;
		rpoHours: number | null;
		status: "draft" | "active" | "retired";
	}[];
};

const CATEGORY: [
	ProzesslandkarteFacts["processes"][number]["category"],
	string,
][] = [
	["management", "Managementprozesse"],
	["core", "Kernprozesse"],
	["support", "Unterstützungsprozesse"],
	["control", "Steuerungs- und Kontrollprozesse"],
];
const CRIT: Record<string, string> = {
	critical: "kritisch",
	important: "wichtig",
	standard: "standard",
};
const hours = (h: number | null) => (h === null ? "—" : `${h} h`);

export function buildProzesslandkarte(f: ProzesslandkarteFacts) {
	const critical = f.processes.filter((p) => p.criticality === "critical");
	const blocks: DocBlock[] = [
		{
			type: "keyValue",
			items: [
				["Prozesse", String(f.processes.length)],
				["davon kritisch", String(critical.length)],
				[
					"kritisch ohne Wiederanlaufziel",
					String(critical.filter((p) => p.rtoHours === null).length),
				],
				[
					"ohne Verantwortliche:n",
					String(f.processes.filter((p) => !p.owner).length),
				],
			],
		},
	];
	for (const [cat, label] of CATEGORY) {
		const rows = f.processes.filter((p) => p.category === cat);
		if (rows.length === 0) continue;
		blocks.push(
			{ type: "heading", level: 1, text: label },
			{
				type: "table",
				columns: [
					{ label: "Nr.", width: 9 },
					{ label: "Prozess", width: 30 },
					{ label: "Übergeordnet", width: 12 },
					{ label: "Verantwortlich", width: 18 },
					{ label: "Kritikalität", width: 11 },
					{ label: "RTO / RPO", width: 11 },
					{ label: "Status", width: 9 },
				],
				rows: rows.map((p) => [
					p.code,
					p.name,
					p.parent ?? "",
					p.owner ?? "offen",
					CRIT[p.criticality] ?? p.criticality,
					`${hours(p.rtoHours)} / ${hours(p.rpoHours)}`,
					p.status === "draft" ? "Entwurf" : "aktiv",
				]),
			},
		);
	}
	if (f.processes.length === 0)
		blocks.push({
			type: "paragraph",
			text: "Noch keine Prozesse erfasst.",
			muted: true,
		});
	return { blocks };
}

export const prozesslandkarte = generator<ProzesslandkarteFacts>({
	code: "NW-PROZESSLANDKARTE",
	async load(tx, orgId) {
		const rows = await tx
			.select()
			.from(processes)
			.where(
				and(
					eq(processes.organizationId, orgId),
					ne(processes.status, "retired"),
				),
			)
			.orderBy(processes.code);
		const names = await userNames(
			tx,
			rows.map((r) => r.ownerUserId),
		);
		const codeById = new Map(rows.map((r) => [r.id, r.code]));
		return {
			processes: rows.map((r) => ({
				code: r.code,
				name: r.name,
				category: r.category,
				parent: r.parentProcessId
					? (codeById.get(r.parentProcessId) ?? null)
					: null,
				owner: r.ownerUserId ? (names.get(r.ownerUserId) ?? null) : null,
				criticality: r.criticality,
				rtoHours: r.rtoHours,
				rpoHours: r.rpoHours,
				status: r.status,
			})),
		};
	},
	build: buildProzesslandkarte,
});
