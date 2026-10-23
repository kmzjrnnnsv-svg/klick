import { desc, eq } from "drizzle-orm";
import {
	auditFindings,
	audits,
	controls,
	frameworks,
	nonconformities,
	requirements,
} from "@/db/schema";
import { shortFrameworkName } from "@/lib/compliance/framework-names";
import type { DocBlock } from "@/lib/export/doc-model";
import { fmtDay } from "../generate/doc";
import { generator } from "../generate/types";
import {
	FINDING_STATUS,
	label,
	NC_STATUS,
	SEVERITY,
	SEVERITY_ORDER,
} from "./doc-audit-labels";

// NW-FINDINGS: Findings-Register über alle Audits mit Schwere, Status,
// Bezug und verknüpfter Abweichung samt Frist (ISO 27001 9.2, 10.2)
export type FindingsFacts = {
	findings: {
		audit: string;
		auditDate: string | null;
		title: string;
		severity: string;
		status: string;
		reference: string | null;
		createdAt: string;
		nonconformity: {
			code: string;
			dueAt: string | null;
			status: string;
		} | null;
	}[];
};

export function buildFindings(f: FindingsFacts, ctx: { today: string }) {
	const open = f.findings.filter((x) => x.status !== "closed");
	const overdue = open.filter(
		(x) =>
			x.nonconformity?.dueAt &&
			x.nonconformity.status !== "closed" &&
			x.nonconformity.dueAt < ctx.today,
	);
	const blocks: DocBlock[] = [
		{
			type: "keyValue",
			items: [
				["Findings gesamt", String(f.findings.length)],
				["offen", String(open.length)],
				...SEVERITY_ORDER.map(
					(s) =>
						[
							`davon offen ${label(SEVERITY, s)}`,
							String(open.filter((x) => x.severity === s).length),
						] as [string, string],
				),
				["Frist der Abweichung überschritten", String(overdue.length)],
				[
					"ohne Abweichung (ab „leicht“)",
					String(
						open.filter((x) => x.severity !== "observation" && !x.nonconformity)
							.length,
					),
				],
			],
		},
		{ type: "heading", level: 1, text: "Register" },
		{
			type: "table",
			columns: [
				{ label: "Audit", width: 18 },
				{ label: "Finding", width: 32 },
				{ label: "Schwere", width: 10 },
				{ label: "Bezug", width: 14 },
				{ label: "Status", width: 11 },
				{ label: "Abweichung / Frist", width: 15 },
			],
			rows: [...f.findings]
				.sort(
					(a, b) =>
						Number(a.status === "closed") - Number(b.status === "closed") ||
						SEVERITY_ORDER.indexOf(a.severity) -
							SEVERITY_ORDER.indexOf(b.severity) ||
						a.createdAt.localeCompare(b.createdAt),
				)
				.map((x) => [
					`${x.audit}\n${fmtDay(x.auditDate)}`,
					x.title,
					label(SEVERITY, x.severity),
					x.reference ?? "—",
					label(FINDING_STATUS, x.status),
					x.nonconformity
						? `${x.nonconformity.code}\n${fmtDay(x.nonconformity.dueAt)} · ${label(NC_STATUS, x.nonconformity.status)}`
						: "—",
				]),
			empty: "Keine Findings erfasst.",
		},
	];
	return { blocks };
}

export const findings = generator<FindingsFacts>({
	code: "NW-FINDINGS",
	async load(tx, orgId) {
		const rows = await tx
			.select({
				audit: audits.title,
				plannedAt: audits.plannedAt,
				performedAt: audits.performedAt,
				title: auditFindings.title,
				severity: auditFindings.severity,
				status: auditFindings.status,
				control: controls.code,
				requirementCode: requirements.code,
				framework: frameworks.slug,
				createdAt: auditFindings.createdAt,
				ncCode: nonconformities.code,
				ncDueAt: nonconformities.dueAt,
				ncStatus: nonconformities.status,
			})
			.from(auditFindings)
			.innerJoin(audits, eq(audits.id, auditFindings.auditId))
			.leftJoin(controls, eq(controls.id, auditFindings.controlId))
			.leftJoin(requirements, eq(requirements.id, auditFindings.requirementId))
			.leftJoin(frameworks, eq(frameworks.id, requirements.frameworkId))
			.leftJoin(
				nonconformities,
				eq(nonconformities.id, auditFindings.nonconformityId),
			)
			.where(eq(auditFindings.organizationId, orgId))
			.orderBy(desc(auditFindings.createdAt));
		return {
			findings: rows.map((r) => ({
				audit: r.audit,
				auditDate: r.performedAt ?? r.plannedAt,
				title: r.title,
				severity: r.severity,
				status: r.status,
				reference:
					[
						r.requirementCode && r.framework
							? `${shortFrameworkName(r.framework)} ${r.requirementCode}`
							: null,
						r.control,
					]
						.filter(Boolean)
						.join("\n") || null,
				createdAt: r.createdAt.toISOString().slice(0, 10),
				nonconformity: r.ncCode
					? {
							code: r.ncCode,
							dueAt: r.ncDueAt,
							status: r.ncStatus ?? "open",
						}
					: null,
			})),
		};
	},
	build: buildFindings,
});
