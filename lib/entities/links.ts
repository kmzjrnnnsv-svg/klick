import { eq, inArray } from "drizzle-orm";
import {
	audits,
	controlImplementations,
	controls,
	documents,
	exceptions,
	incidents,
	nonconformities,
	processes,
	risks,
} from "@/db/schema";
import type { EntityKind } from "@/db/schema/enums";
import type { OrgTx } from "@/lib/db/with-org";

// Link und Titel zu einer polymorphen Entität (Freigaben, Aufgaben, Feed).
export function entityHref(
	kind: EntityKind,
	id: string,
	title?: string,
): string {
	switch (kind) {
		case "control":
			return title?.startsWith("CC-")
				? `/controls/${title.split(" ")[0]}`
				: "/controls";
		case "risk":
			return `/risiken/${id}`;
		case "document":
			return title
				? `/dokumente/${encodeURIComponent(title.split(" ")[0] ?? "")}`
				: "/dokumente";
		case "incident":
			return `/vorfaelle/${id}`;
		case "process":
			return title
				? `/prozesse/${encodeURIComponent(title.split(" ")[0] ?? "")}`
				: "/prozesse";
		case "nonconformity":
			return `/abweichungen/${id}`;
		case "audit":
			return `/audits/${id}`;
		case "audit_request":
			return "/audits";
		case "management_review":
			return "/managementbewertung";
		case "exception":
			return "/risiken?tab=ausnahmen";
		case "provider":
			return "/dienstleister";
		case "asset":
			return "/assets";
		case "task":
			return "/heute/aufgaben";
		case "aml_risk_analysis":
			return "/aml?tab=risikoanalyse";
		case "aml_monitoring_rule":
			return "/aml?tab=monitoring";
		case "suspicious_report":
			return "/aml?tab=verdacht";
		case "jurisdiction":
			return "/aml?tab=laender";
		case "own_funds_calculation":
			return "/eigenmittel";
		case "crypto_asset":
			return "/kryptowerte";
		case "shareholder":
			return "/organisation?tab=gesellschafter";
		case "milestone":
			return "/roadmap";
		default:
			return "/heute";
	}
}

// Titel je Entität: "<Code> <Titel>" — der Code steht vorn, damit entityHref
// daraus den Pfad ableiten kann.
export async function resolveEntityTitles(
	tx: OrgTx,
	orgId: string,
	refs: readonly { entityType: EntityKind; entityId: string }[],
): Promise<Map<string, string>> {
	const out = new Map<string, string>();
	const byKind = new Map<EntityKind, string[]>();
	for (const r of refs) {
		const list = byKind.get(r.entityType) ?? [];
		list.push(r.entityId);
		byKind.set(r.entityType, list);
	}
	const ids = (k: EntityKind) => [...new Set(byKind.get(k) ?? [])];
	if (ids("control").length) {
		const rows = await tx
			.select({
				id: controlImplementations.id,
				code: controls.code,
				title: controls.title,
			})
			.from(controlImplementations)
			.innerJoin(controls, eq(controls.id, controlImplementations.controlId))
			.where(inArray(controlImplementations.id, ids("control")));
		for (const r of rows) out.set(`control:${r.id}`, `${r.code} ${r.title}`);
	}
	if (ids("risk").length) {
		const rows = await tx
			.select({ id: risks.id, code: risks.code, title: risks.title })
			.from(risks)
			.where(inArray(risks.id, ids("risk")));
		for (const r of rows) out.set(`risk:${r.id}`, `${r.code} ${r.title}`);
	}
	if (ids("document").length) {
		const rows = await tx
			.select({
				id: documents.id,
				n: documents.docNumber,
				title: documents.title,
			})
			.from(documents)
			.where(inArray(documents.id, ids("document")));
		for (const r of rows) out.set(`document:${r.id}`, `${r.n} ${r.title}`);
	}
	if (ids("incident").length) {
		const rows = await tx
			.select({
				id: incidents.id,
				code: incidents.code,
				title: incidents.title,
			})
			.from(incidents)
			.where(inArray(incidents.id, ids("incident")));
		for (const r of rows) out.set(`incident:${r.id}`, `${r.code} ${r.title}`);
	}
	if (ids("process").length) {
		const rows = await tx
			.select({ id: processes.id, code: processes.code, name: processes.name })
			.from(processes)
			.where(inArray(processes.id, ids("process")));
		for (const r of rows) out.set(`process:${r.id}`, `${r.code} ${r.name}`);
	}
	if (ids("nonconformity").length) {
		const rows = await tx
			.select({
				id: nonconformities.id,
				code: nonconformities.code,
				title: nonconformities.title,
			})
			.from(nonconformities)
			.where(inArray(nonconformities.id, ids("nonconformity")));
		for (const r of rows)
			out.set(`nonconformity:${r.id}`, `${r.code} ${r.title}`);
	}
	if (ids("audit").length) {
		const rows = await tx
			.select({ id: audits.id, title: audits.title })
			.from(audits)
			.where(inArray(audits.id, ids("audit")));
		for (const r of rows) out.set(`audit:${r.id}`, r.title);
	}
	if (ids("exception").length) {
		const rows = await tx
			.select({ id: exceptions.id, title: exceptions.title })
			.from(exceptions)
			.where(inArray(exceptions.id, ids("exception")));
		for (const r of rows) out.set(`exception:${r.id}`, r.title);
	}
	void orgId;
	return out;
}
