import { eq, inArray } from "drizzle-orm";
import {
	amlRiskAnalyses,
	assessments,
	assets,
	auditFindings,
	audits,
	complaints,
	controlImplementations,
	controls,
	controlTests,
	documents,
	exceptions,
	incidents,
	nonconformities,
	ownFundsCalculations,
	processes,
	products,
	providers,
	resolutions,
	risks,
	scopes,
	securityEngagements,
	trainingRequirements,
	whistleblowingReports,
} from "@/db/schema";
import type { EntityKind } from "@/db/schema/enums";
import type { Nonconformity } from "@/db/schema/management";
import type { OrgTx } from "@/lib/db/with-org";

// Link zu einer polymorphen Entität (Freigaben, Aufgaben, Feed, Suche).
// `ref` ist für Controls, Dokumente und Prozesse der Code bzw. die Nummer
// (vorn im Titel aus resolveEntityTitles) — ohne ihn geht es zum Register.
// Jede Art hat ein Ziel; der switch ist erschöpfend (neue Art = Compilerfehler
// statt stiller Rückfall auf /heute).
export function entityHref(kind: EntityKind, id: string, ref?: string): string {
	const lead = ref?.split(" ")[0] ?? "";
	switch (kind) {
		case "control":
			return /^CC-[A-Z]+-\d+$/.test(lead) ? `/controls/${lead}` : "/controls";
		case "risk":
			return `/risiken/${id}`;
		case "document":
			return /^[A-Z]{2,5}-\d+$/.test(lead)
				? `/dokumente/${encodeURIComponent(lead)}`
				: "/dokumente";
		case "incident":
			return `/vorfaelle/${id}`;
		case "process":
			return /^P-\d+$/.test(lead)
				? `/prozesse/${encodeURIComponent(lead)}`
				: "/prozesse";
		case "nonconformity":
			return `/abweichungen/${id}`;
		case "audit":
			return `/audits/${id}`;
		case "audit_request":
		case "audit_finding":
			return "/audits?tab=findings";
		case "management_review":
			return "/managementbewertung";
		case "resolution":
			return "/beschluesse";
		case "training":
			return "/schulungen";
		case "exception":
			return "/risiken?tab=ausnahmen";
		case "loss_event":
			return "/risiken?tab=schadensfaelle";
		case "provider":
			return `/dienstleister/${id}`;
		case "asset":
			return "/assets";
		case "evidence":
			return "/nachweise";
		case "task":
			return "/heute/aufgaben";
		case "milestone":
			return "/roadmap";
		case "complaint":
			return "/beschwerden";
		case "whistleblowing_report":
			return "/beschwerden?tab=hinweise";
		case "communication":
			return "/organisation?tab=kommunikation";
		case "regulator_interaction":
			return "/organisation?tab=aufsicht";
		case "objective":
			return "/organisation?tab=ziele";
		case "scope":
			return "/organisation?tab=geltungsbereich";
		case "role_assignment":
			return "/organisation?tab=rollen";
		case "interested_party":
		case "context_issue":
			return "/organisation?tab=kontext";
		case "obligation_run":
			return "/kalender?tab=pflichten";
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
		case "processing_activity":
			return "/datenschutz";
		case "data_subject_request":
			return "/datenschutz?tab=anfragen";
		case "insurance_policy":
			return "/organisation?tab=versicherungen";
		case "organization":
			return "/einstellungen?tab=organisation";
		case "member":
			return "/team";
		case "assessment":
			return `/gap-analyse/${id}`;
		case "product":
			return `/produkte/${id}`;
		case "security_finding":
			return `/sicherheit/befunde/${id}`;
		case "security_engagement":
			return `/sicherheit/auftraege/${id}`;
		default: {
			const never: never = kind;
			return never;
		}
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
	if (ids("resolution").length) {
		const rows = await tx
			.select({
				id: resolutions.id,
				number: resolutions.resolutionNumber,
				subject: resolutions.subject,
			})
			.from(resolutions)
			.where(inArray(resolutions.id, ids("resolution")));
		for (const r of rows)
			out.set(`resolution:${r.id}`, `${r.number} ${r.subject}`);
	}
	if (ids("product").length) {
		const rows = await tx
			.select({ id: products.id, code: products.code, name: products.name })
			.from(products)
			.where(inArray(products.id, ids("product")));
		for (const r of rows) out.set(`product:${r.id}`, `${r.code} ${r.name}`);
	}
	// Weitere Arten mit sprechendem Titel (sonst zeigten Aufgaben und
	// Freigaben nur die Art oder gar nichts).
	const simple = async (
		kind: EntityKind,
		rows: Promise<{ id: string; label: string | null }[]>,
	) => {
		for (const r of await rows)
			if (r.label) out.set(`${kind}:${r.id}`, r.label);
	};
	if (ids("provider").length)
		await simple(
			"provider",
			tx
				.select({ id: providers.id, label: providers.name })
				.from(providers)
				.where(inArray(providers.id, ids("provider"))),
		);
	if (ids("asset").length)
		await simple(
			"asset",
			tx
				.select({ id: assets.id, label: assets.name })
				.from(assets)
				.where(inArray(assets.id, ids("asset"))),
		);
	if (ids("training").length)
		await simple(
			"training",
			tx
				.select({
					id: trainingRequirements.id,
					label: trainingRequirements.title,
				})
				.from(trainingRequirements)
				.where(inArray(trainingRequirements.id, ids("training"))),
		);
	if (ids("complaint").length)
		await simple(
			"complaint",
			tx
				.select({ id: complaints.id, label: complaints.code })
				.from(complaints)
				.where(inArray(complaints.id, ids("complaint"))),
		);
	if (ids("whistleblowing_report").length)
		await simple(
			"whistleblowing_report",
			tx
				.select({
					id: whistleblowingReports.id,
					label: whistleblowingReports.internalRef,
				})
				.from(whistleblowingReports)
				.where(inArray(whistleblowingReports.id, ids("whistleblowing_report"))),
		);
	if (ids("aml_risk_analysis").length)
		for (const r of await tx
			.select({ id: amlRiskAnalyses.id, v: amlRiskAnalyses.version })
			.from(amlRiskAnalyses)
			.where(inArray(amlRiskAnalyses.id, ids("aml_risk_analysis"))))
			out.set(`aml_risk_analysis:${r.id}`, `AML-Risikoanalyse ${r.v}`);
	if (ids("own_funds_calculation").length)
		for (const r of await tx
			.select({
				id: ownFundsCalculations.id,
				p: ownFundsCalculations.periodLabel,
			})
			.from(ownFundsCalculations)
			.where(inArray(ownFundsCalculations.id, ids("own_funds_calculation"))))
			out.set(`own_funds_calculation:${r.id}`, `Eigenmittel ${r.p}`);
	if (ids("scope").length)
		for (const r of await tx
			.select({ id: scopes.id, s: scopes.statement })
			.from(scopes)
			.where(inArray(scopes.id, ids("scope"))))
			out.set(`scope:${r.id}`, `Geltungsbereich: ${r.s.slice(0, 60)}`);
	if (ids("security_engagement").length)
		await simple(
			"security_engagement",
			tx
				.select({
					id: securityEngagements.id,
					label: securityEngagements.title,
				})
				.from(securityEngagements)
				.where(inArray(securityEngagements.id, ids("security_engagement"))),
		);
	if (ids("assessment").length)
		await simple(
			"assessment",
			tx
				.select({ id: assessments.id, label: assessments.title })
				.from(assessments)
				.where(inArray(assessments.id, ids("assessment"))),
		);
	return out;
}

// Quelle einer Abweichung: der Test hängt am Control (Code statt Test-ID),
// das Finding an einem konkreten Audit.
export async function nonconformitySourceHref(
	tx: OrgTx,
	nc: Pick<Nonconformity, "source" | "sourceRefId">,
): Promise<string | null> {
	const ref = nc.sourceRefId;
	switch (nc.source) {
		case "control_test": {
			if (!ref) return "/controls";
			const [row] = await tx
				.select({ code: controls.code })
				.from(controlTests)
				.innerJoin(
					controlImplementations,
					eq(controlImplementations.id, controlTests.implementationId),
				)
				.innerJoin(controls, eq(controls.id, controlImplementations.controlId))
				.where(eq(controlTests.id, ref))
				.limit(1);
			return entityHref("control", ref, row?.code);
		}
		case "audit": {
			if (!ref) return "/audits?tab=findings";
			const [row] = await tx
				.select({ auditId: auditFindings.auditId })
				.from(auditFindings)
				.where(eq(auditFindings.id, ref))
				.limit(1);
			return row
				? `/audits/${row.auditId}?tab=findings`
				: "/audits?tab=findings";
		}
		case "incident":
			return ref ? entityHref("incident", ref) : "/vorfaelle";
		case "complaint":
			return entityHref("complaint", ref ?? "");
		case "management_review":
			return entityHref("management_review", ref ?? "");
		case "security_finding":
			return ref ? entityHref("security_finding", ref) : "/sicherheit";
		default:
			return null;
	}
}
