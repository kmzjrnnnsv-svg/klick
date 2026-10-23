import { and, desc, eq } from "drizzle-orm";
import {
	auditFindings,
	auditRequests,
	audits,
	controls,
	frameworks,
	nonconformities,
	requirements,
} from "@/db/schema";
import { shortFrameworkName } from "@/lib/compliance/framework-names";
import { userNames } from "@/lib/compliance/queries";
import type { DocBlock } from "@/lib/export/doc-model";
import { fmtDay } from "../generate/doc";
import { generator } from "../generate/types";
import {
	AUDIT_STATUS,
	AUDIT_TYPE,
	FINDING_STATUS,
	label,
	SEVERITY,
	SEVERITY_ORDER,
} from "./doc-audit-labels";

// NW-AUDITBERICHT (je Audit): Umfang, Kriterien, Auditor:innen, Prüfpfad-
// Kennzahlen, Feststellungen und Ergebnis (ISO 27001 9.2.2, DORA Art. 6(6))
export type AuditberichtFacts = {
	audit: {
		title: string;
		type: string;
		scope: string | null;
		periodStart: string | null;
		periodEnd: string | null;
		frameworks: string[];
		auditors: string[];
		owner: string | null;
		plannedAt: string | null;
		performedAt: string | null;
		status: string;
	};
	findings: {
		title: string;
		description: string | null;
		severity: string;
		status: string;
		control: string | null;
		requirement: string | null;
		nonconformity: string | null;
	}[];
	requests: { total: number; open: number };
};

export function buildAuditbericht(f: AuditberichtFacts) {
	const a = f.audit;
	const bySeverity = SEVERITY_ORDER.map(
		(s) =>
			[
				label(SEVERITY, s),
				String(f.findings.filter((x) => x.severity === s).length),
			] as [string, string],
	);
	const open = f.findings.filter((x) => x.status !== "closed").length;
	const findings = [...f.findings].sort(
		(x, y) =>
			SEVERITY_ORDER.indexOf(x.severity) - SEVERITY_ORDER.indexOf(y.severity),
	);
	const blocks: DocBlock[] = [
		{ type: "heading", level: 1, text: "Rahmen des Audits" },
		{
			type: "keyValue",
			items: [
				["Art", label(AUDIT_TYPE, a.type)],
				["Status", label(AUDIT_STATUS, a.status)],
				[
					"Prüfungskriterien",
					a.frameworks.length > 0
						? a.frameworks.map(shortFrameworkName).join(", ")
						: "—",
				],
				["Umfang", a.scope ?? "—"],
				[
					"Prüfungszeitraum",
					a.periodStart || a.periodEnd
						? `${fmtDay(a.periodStart)} bis ${fmtDay(a.periodEnd)}`
						: "—",
				],
				["geplant", fmtDay(a.plannedAt)],
				["durchgeführt", fmtDay(a.performedAt)],
				["Auditor:innen", a.auditors.join(", ") || "—"],
				["Verantwortlich", a.owner ?? "—"],
			],
		},
		{ type: "heading", level: 1, text: "Ergebnis" },
		{
			type: "keyValue",
			items: [
				["Feststellungen gesamt", String(f.findings.length)],
				...bySeverity,
				["noch offen", String(open)],
				[
					"mit Abweichung (Korrekturmaßnahme)",
					String(f.findings.filter((x) => x.nonconformity).length),
				],
				["Nachweisanfragen", `${f.requests.total} (offen: ${f.requests.open})`],
			],
		},
		{
			type: "paragraph",
			text:
				f.findings.length === 0
					? "Das Audit ergab keine Feststellungen."
					: f.findings.some(
								(x) => x.severity === "critical" || x.severity === "major",
							)
						? "Das Audit ergab schwere Feststellungen; die Korrekturmaßnahmen werden als Abweichungen mit Fristen verfolgt."
						: "Das Audit ergab keine schweren Feststellungen; leichte Feststellungen und Beobachtungen werden nachverfolgt.",
		},
		{ type: "heading", level: 1, text: "Feststellungen" },
		{
			type: "table",
			columns: [
				{ label: "Schwere", width: 11 },
				{ label: "Feststellung", width: 40 },
				{ label: "Bezug", width: 20 },
				{ label: "Status", width: 12 },
				{ label: "Abweichung", width: 14 },
			],
			rows: findings.map((x) => [
				label(SEVERITY, x.severity),
				`${x.title}${x.description ? `\n${x.description}` : ""}`,
				[x.requirement, x.control].filter(Boolean).join("\n") || "—",
				label(FINDING_STATUS, x.status),
				x.nonconformity ?? "—",
			]),
			empty: "Keine Feststellungen.",
		},
	];
	return { title: `Auditbericht: ${a.title}`, blocks };
}

export const auditbericht = generator<AuditberichtFacts>({
	code: "NW-AUDITBERICHT",
	async entities(tx, orgId) {
		const rows = await tx
			.select({
				id: audits.id,
				title: audits.title,
				plannedAt: audits.plannedAt,
				performedAt: audits.performedAt,
			})
			.from(audits)
			.where(eq(audits.organizationId, orgId))
			.orderBy(desc(audits.plannedAt));
		return rows.map((r) => ({
			id: r.id,
			label: `${r.title} · ${fmtDay(r.performedAt ?? r.plannedAt)}`,
		}));
	},
	async load(tx, orgId, entityId) {
		if (!entityId) return null;
		const [a] = await tx
			.select()
			.from(audits)
			.where(and(eq(audits.organizationId, orgId), eq(audits.id, entityId)))
			.limit(1);
		if (!a) return null;
		const [rows, reqs] = await Promise.all([
			tx
				.select({
					title: auditFindings.title,
					description: auditFindings.description,
					severity: auditFindings.severity,
					status: auditFindings.status,
					control: controls.code,
					requirementCode: requirements.code,
					framework: frameworks.slug,
					nonconformity: nonconformities.code,
				})
				.from(auditFindings)
				.leftJoin(controls, eq(controls.id, auditFindings.controlId))
				.leftJoin(
					requirements,
					eq(requirements.id, auditFindings.requirementId),
				)
				.leftJoin(frameworks, eq(frameworks.id, requirements.frameworkId))
				.leftJoin(
					nonconformities,
					eq(nonconformities.id, auditFindings.nonconformityId),
				)
				.where(
					and(
						eq(auditFindings.organizationId, orgId),
						eq(auditFindings.auditId, a.id),
					),
				)
				.orderBy(auditFindings.createdAt),
			tx
				.select({ status: auditRequests.status })
				.from(auditRequests)
				.where(
					and(
						eq(auditRequests.organizationId, orgId),
						eq(auditRequests.auditId, a.id),
					),
				),
		]);
		const names = await userNames(tx, [
			a.ownerUserId,
			a.auditorUserId,
			...a.auditorMemberIds,
		]);
		const auditors = [
			...new Set(
				[a.auditorUserId, ...a.auditorMemberIds]
					.filter((x): x is string => Boolean(x))
					.map((id) => names.get(id) ?? ""),
			),
		].filter(Boolean);
		return {
			audit: {
				title: a.title,
				type: a.type,
				scope: a.scope,
				periodStart: a.periodStart,
				periodEnd: a.periodEnd,
				frameworks: a.frameworkIds ?? [],
				auditors: a.externalAuditor
					? [...auditors, a.externalAuditor]
					: auditors,
				owner: a.ownerUserId ? (names.get(a.ownerUserId) ?? null) : null,
				plannedAt: a.plannedAt,
				performedAt: a.performedAt,
				status: a.status,
			},
			findings: rows.map((r) => ({
				title: r.title,
				description: r.description,
				severity: r.severity,
				status: r.status,
				control: r.control,
				requirement:
					r.requirementCode && r.framework
						? `${shortFrameworkName(r.framework)} ${r.requirementCode}`
						: null,
				nonconformity: r.nonconformity,
			})),
			requests: {
				total: reqs.length,
				open: reqs.filter((r) => r.status === "open").length,
			},
		};
	},
	build: buildAuditbericht,
});
