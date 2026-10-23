import { desc, eq } from "drizzle-orm";
import {
	auditProgrammeItems,
	auditProgrammes,
	audits,
	controls,
	processes,
	providers,
} from "@/db/schema";
import { DOMAINS } from "@/db/schema/enums";
import {
	type ExpectedScope,
	programmeCoverage,
} from "@/lib/compliance/audit-programme";
import { shortFrameworkName } from "@/lib/compliance/framework-names";
import { userNames } from "@/lib/compliance/queries";
import type { DocBlock } from "@/lib/export/doc-model";
import { fmtDay } from "../generate/doc";
import { generator } from "../generate/types";
import {
	DOMAIN,
	label,
	pct,
	RISK_RATING,
	SCOPE_TYPE,
} from "./doc-audit-labels";

// NW-AUDITPROGRAMM: mehrjähriges Auditprogramm (ISO 27001 9.2, DORA Art.
// 6(6), ZAG-MaRisk BT 2.3) mit Abdeckungs-Check aus programmeCoverage
export type AuditprogrammFacts = {
	expected: ExpectedScope;
	programmes: {
		title: string;
		cycleStart: string;
		cycleYears: number;
		approvedBy: string | null;
		approvedAt: string | null;
		items: {
			scopeType: "domain" | "process" | "control" | "provider" | "framework";
			scopeRef: string;
			label: string;
			plannedYear: number;
			riskRating: string;
			frequencyYears: number;
			audit: string | null;
		}[];
	}[];
};

export function buildAuditprogramm(f: AuditprogrammFacts) {
	if (f.programmes.length === 0)
		return {
			blocks: [
				{
					type: "paragraph",
					muted: true,
					text: "Noch kein Auditprogramm angelegt.",
				},
			] satisfies DocBlock[],
		};
	const blocks: DocBlock[] = [
		{
			type: "paragraph",
			text: "Das Auditprogramm plant über den Zyklus Audits für jede Domäne, jeden kritischen oder wichtigen Prozess und jeden wesentlichen oder kritischen Dienstleister. Der Abdeckungs-Check zeigt, was im Zyklus noch nicht eingeplant ist.",
		},
	];
	for (const p of f.programmes) {
		const cov = programmeCoverage(p, p.items, f.expected);
		blocks.push(
			{ type: "heading", level: 1, text: p.title },
			{
				type: "keyValue",
				items: [
					[
						"Zyklus",
						`${cov.cycleStartYear}–${cov.cycleEndYear} (ab ${fmtDay(p.cycleStart)}, ${p.cycleYears} Jahre)`,
					],
					[
						"Freigabe",
						p.approvedAt
							? `${fmtDay(p.approvedAt)}${p.approvedBy ? ` · ${p.approvedBy}` : ""}`
							: "noch nicht freigegeben",
					],
					[
						"Abdeckung",
						`${cov.covered} von ${cov.total} Prüfgegenständen (${pct(cov.covered, cov.total)})`,
					],
					[
						"Jahre ohne Planung",
						cov.unplannedYears.length > 0
							? cov.unplannedYears.join(", ")
							: "keine",
					],
				],
			},
			{ type: "heading", level: 2, text: "Planung" },
			{
				type: "table",
				columns: [
					{ label: "Jahr", width: 8 },
					{ label: "Art", width: 13 },
					{ label: "Prüfgegenstand", width: 38 },
					{ label: "Risiko", width: 10 },
					{ label: "Turnus", width: 10 },
					{ label: "Audit", width: 22 },
				],
				rows: [...p.items]
					.sort(
						(a, b) =>
							a.plannedYear - b.plannedYear || a.label.localeCompare(b.label),
					)
					.map((i) => [
						String(i.plannedYear),
						label(SCOPE_TYPE, i.scopeType),
						i.label,
						label(RISK_RATING, i.riskRating),
						`alle ${i.frequencyYears} J.`,
						i.audit ?? "—",
					]),
				empty: "Noch keine Prüfgegenstände eingeplant.",
			},
		);
		if (cov.gaps.length > 0)
			blocks.push(
				{ type: "heading", level: 2, text: "Im Zyklus nicht eingeplant" },
				{
					type: "list",
					items: cov.gaps.map(
						(g) =>
							`${label(SCOPE_TYPE, g.scopeType)}: ${g.scopeType === "domain" ? label(DOMAIN, g.scopeRef) : g.label}`,
					),
				},
			);
	}
	return { blocks };
}

export const auditprogramm = generator<AuditprogrammFacts>({
	code: "NW-AUDITPROGRAMM",
	async load(tx, orgId) {
		const [progs, items, procs, provs, auditRows, ctrls] = await Promise.all([
			tx
				.select()
				.from(auditProgrammes)
				.where(eq(auditProgrammes.organizationId, orgId))
				.orderBy(desc(auditProgrammes.cycleStart)),
			tx
				.select()
				.from(auditProgrammeItems)
				.where(eq(auditProgrammeItems.organizationId, orgId)),
			tx
				.select({
					code: processes.code,
					name: processes.name,
					criticality: processes.criticality,
					status: processes.status,
				})
				.from(processes)
				.where(eq(processes.organizationId, orgId)),
			tx
				.select({
					id: providers.id,
					name: providers.name,
					isMaterial: providers.isMaterial,
					criticality: providers.criticality,
				})
				.from(providers)
				.where(eq(providers.organizationId, orgId)),
			tx
				.select({
					id: audits.id,
					title: audits.title,
					plannedAt: audits.plannedAt,
					performedAt: audits.performedAt,
				})
				.from(audits)
				.where(eq(audits.organizationId, orgId)),
			tx.select({ code: controls.code, title: controls.title }).from(controls),
		]);
		const names = await userNames(
			tx,
			progs.map((p) => p.approvedByUserId),
		);
		const scopeLabel = (type: string, ref: string) => {
			switch (type) {
				case "domain":
					return label(DOMAIN, ref);
				case "process": {
					const p = procs.find((x) => x.code === ref);
					return p ? `${p.code} ${p.name}` : ref;
				}
				case "provider":
					return provs.find((x) => x.id === ref)?.name ?? ref;
				case "control": {
					const c = ctrls.find((x) => x.code === ref);
					return c ? `${c.code} ${c.title}` : ref;
				}
				case "framework":
					return shortFrameworkName(ref);
				default:
					return ref;
			}
		};
		return {
			expected: {
				domains: [...DOMAINS],
				processes: procs
					.filter((p) => p.criticality !== "standard" && p.status !== "retired")
					.map((p) => ({ code: p.code, name: p.name })),
				providers: provs
					.filter((p) => p.isMaterial || p.criticality === "critical")
					.map((p) => ({ id: p.id, name: p.name })),
			},
			programmes: progs.map((p) => ({
				title: p.title,
				cycleStart: p.cycleStart,
				cycleYears: p.cycleYears,
				approvedBy: p.approvedByUserId
					? (names.get(p.approvedByUserId) ?? null)
					: null,
				approvedAt: p.approvedAt
					? p.approvedAt.toISOString().slice(0, 10)
					: null,
				items: items
					.filter((i) => i.programmeId === p.id)
					.map((i) => {
						const a = auditRows.find((x) => x.id === i.auditId);
						return {
							scopeType: i.scopeType,
							scopeRef: i.scopeRef,
							label: scopeLabel(i.scopeType, i.scopeRef),
							plannedYear: i.plannedYear,
							riskRating: i.riskRating,
							frequencyYears: i.frequencyYears,
							audit: a
								? `${a.title} (${fmtDay(a.performedAt ?? a.plannedAt)})`
								: null,
						};
					}),
			})),
		};
	},
	build: buildAuditprogramm,
});
