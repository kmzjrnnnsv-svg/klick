import { and, eq, gte, inArray, isNotNull, lte, ne, or } from "drizzle-orm";
import {
	approvalRequests,
	approvalWorkflows,
	assets,
	audits,
	controlImplementations,
	controls,
	controlTests,
	dataSubjectRequests,
	decisionRequests,
	documents,
	exceptions,
	incidents,
	insurancePolicies,
	managementReviews,
	milestones,
	nonconformities,
	objectives,
	products,
	providers,
	risks,
	securityFindings,
	trainingAssignments,
} from "@/db/schema";
import type { OrgTx } from "@/lib/db/with-org";
import { upcomingLegalChanges } from "./catalog/regulatory-calendar";
import { type DateSource, noticeDate } from "./dates";
import { listObligationRuns } from "./queries-p3";

const iso = (v: Date | string | null | undefined): string | null =>
	v
		? typeof v === "string"
			? v.slice(0, 10)
			: v.toISOString().slice(0, 10)
		: null;

// Quellen aller Termine (C2) im Zeitraum; Offenes mit Datum vor dem Zeitraum
// kommt mit (überfällig). Zugangsablauf externer Rollen ergänzt die Seite aus
// listOrgMembers (member_access nur über memberAccessFor).
export async function loadDateSources(
	tx: OrgTx,
	orgId: string,
	range: { from: string; to: string },
	frameworks: readonly string[],
	now = new Date(),
): Promise<DateSource[]> {
	const { from, to } = range;
	const toTs = new Date(`${to}T23:59:59Z`);
	const [
		runs,
		docs,
		riskRows,
		impls,
		provs,
		approvals,
		decisions,
		objs,
		assetRows,
		auditRows,
		reviews,
		tests,
		trainings,
		ncs,
		findings,
		excs,
		policies,
		dsrs,
		incs,
		prods,
		mss,
	] = await Promise.all([
		listObligationRuns(tx, orgId, { from, to }),
		tx
			.select({
				docNumber: documents.docNumber,
				title: documents.title,
				nextReviewAt: documents.nextReviewAt,
				ownerUserId: documents.ownerUserId,
			})
			.from(documents)
			.where(
				and(
					eq(documents.organizationId, orgId),
					eq(documents.status, "approved"),
					lte(documents.nextReviewAt, to),
				),
			),
		tx
			.select({
				id: risks.id,
				code: risks.code,
				title: risks.title,
				reviewAt: risks.reviewAt,
				ownerUserId: risks.ownerUserId,
			})
			.from(risks)
			.where(
				and(
					eq(risks.organizationId, orgId),
					ne(risks.status, "closed"),
					lte(risks.reviewAt, to),
				),
			),
		tx
			.select({
				code: controls.code,
				title: controls.title,
				nextReviewAt: controlImplementations.nextReviewAt,
				ownerUserId: controlImplementations.ownerUserId,
			})
			.from(controlImplementations)
			.innerJoin(controls, eq(controls.id, controlImplementations.controlId))
			.where(
				and(
					eq(controlImplementations.organizationId, orgId),
					lte(controlImplementations.nextReviewAt, to),
				),
			),
		tx
			.select({
				id: providers.id,
				name: providers.name,
				nextAssessmentAt: providers.nextAssessmentAt,
				contractEnd: providers.contractEnd,
				noticePeriodDays: providers.noticePeriodDays,
				ownerUserId: providers.ownerUserId,
			})
			.from(providers)
			.where(
				and(
					eq(providers.organizationId, orgId),
					ne(providers.status, "terminated"),
				),
			),
		tx
			.select({
				dueAt: approvalRequests.dueAt,
				workflow: approvalWorkflows.name,
				entityType: approvalRequests.entityType,
			})
			.from(approvalRequests)
			.innerJoin(
				approvalWorkflows,
				eq(approvalWorkflows.id, approvalRequests.workflowId),
			)
			.where(
				and(
					eq(approvalRequests.organizationId, orgId),
					eq(approvalRequests.status, "pending"),
					lte(approvalRequests.dueAt, toTs),
				),
			),
		tx
			.select({
				code: decisionRequests.code,
				question: decisionRequests.question,
				dueAt: decisionRequests.dueAt,
				requestedByUserId: decisionRequests.requestedByUserId,
			})
			.from(decisionRequests)
			.where(
				and(
					eq(decisionRequests.organizationId, orgId),
					eq(decisionRequests.status, "open"),
					lte(decisionRequests.dueAt, to),
				),
			),
		tx
			.select({
				title: objectives.title,
				dueAt: objectives.dueAt,
				nextMeasureAt: objectives.nextMeasureAt,
				status: objectives.status,
				ownerUserId: objectives.ownerUserId,
			})
			.from(objectives)
			.where(
				and(
					eq(objectives.organizationId, orgId),
					eq(objectives.approvalStatus, "approved"),
					inArray(objectives.status, ["open", "on_track", "at_risk"]),
				),
			),
		tx
			.select({
				name: assets.name,
				endOfLifeAt: assets.endOfLifeAt,
				supportEndAt: assets.supportEndAt,
				maintenanceUntil: assets.maintenanceUntil,
				ownerUserId: assets.ownerUserId,
			})
			.from(assets)
			.where(
				and(
					eq(assets.organizationId, orgId),
					eq(assets.status, "active"),
					or(
						isNotNull(assets.endOfLifeAt),
						isNotNull(assets.supportEndAt),
						isNotNull(assets.maintenanceUntil),
					),
				),
			),
		tx
			.select({
				id: audits.id,
				title: audits.title,
				plannedAt: audits.plannedAt,
				periodStart: audits.periodStart,
				status: audits.status,
				ownerUserId: audits.ownerUserId,
			})
			.from(audits)
			.where(eq(audits.organizationId, orgId)),
		tx
			.select({
				heldAt: managementReviews.heldAt,
				status: managementReviews.status,
				ownerUserId: managementReviews.ownerUserId,
			})
			.from(managementReviews)
			.where(
				and(
					eq(managementReviews.organizationId, orgId),
					gte(managementReviews.heldAt, from),
					lte(managementReviews.heldAt, to),
				),
			),
		tx
			.select({
				code: controls.code,
				method: controlTests.method,
				plannedAt: controlTests.plannedAt,
				testedAt: controlTests.testedAt,
				nextTestAt: controlTests.nextTestAt,
				testerUserId: controlTests.testerUserId,
			})
			.from(controlTests)
			.leftJoin(
				controlImplementations,
				eq(controlImplementations.id, controlTests.implementationId),
			)
			.leftJoin(controls, eq(controls.id, controlImplementations.controlId))
			.where(eq(controlTests.organizationId, orgId)),
		tx
			.select({
				dueAt: trainingAssignments.dueAt,
				userId: trainingAssignments.userId,
			})
			.from(trainingAssignments)
			.where(
				and(
					eq(trainingAssignments.organizationId, orgId),
					inArray(trainingAssignments.status, ["due", "overdue"]),
					lte(trainingAssignments.dueAt, to),
				),
			),
		tx
			.select({
				id: nonconformities.id,
				code: nonconformities.code,
				title: nonconformities.title,
				dueAt: nonconformities.dueAt,
				effectivenessCheckAt: nonconformities.effectivenessCheckAt,
				status: nonconformities.status,
				ownerUserId: nonconformities.ownerUserId,
			})
			.from(nonconformities)
			.where(
				and(
					eq(nonconformities.organizationId, orgId),
					ne(nonconformities.status, "closed"),
				),
			),
		tx
			.select({
				id: securityFindings.id,
				title: securityFindings.title,
				severity: securityFindings.severity,
				dueAt: securityFindings.dueAt,
				ownerUserId: securityFindings.ownerUserId,
			})
			.from(securityFindings)
			.where(
				and(
					eq(securityFindings.organizationId, orgId),
					inArray(securityFindings.status, ["open", "in_progress"]),
					inArray(securityFindings.severity, ["critical", "high"]),
					lte(securityFindings.dueAt, toTs),
				),
			),
		tx
			.select({
				title: exceptions.title,
				validUntil: exceptions.validUntil,
				ownerUserId: exceptions.ownerUserId,
			})
			.from(exceptions)
			.where(
				and(
					eq(exceptions.organizationId, orgId),
					eq(exceptions.status, "approved"),
					lte(exceptions.validUntil, to),
				),
			),
		tx
			.select({
				type: insurancePolicies.type,
				insurer: insurancePolicies.insurer,
				validUntil: insurancePolicies.validUntil,
				ownerUserId: insurancePolicies.ownerUserId,
			})
			.from(insurancePolicies)
			.where(
				and(
					eq(insurancePolicies.organizationId, orgId),
					lte(insurancePolicies.validUntil, to),
				),
			),
		tx
			.select({
				dueAt: dataSubjectRequests.dueAt,
				extendedUntil: dataSubjectRequests.extendedUntil,
				type: dataSubjectRequests.type,
				ownerUserId: dataSubjectRequests.ownerUserId,
			})
			.from(dataSubjectRequests)
			.where(
				and(
					eq(dataSubjectRequests.organizationId, orgId),
					inArray(dataSubjectRequests.status, ["open", "in_progress"]),
				),
			),
		tx
			.select({
				id: incidents.id,
				code: incidents.code,
				title: incidents.title,
				initialDueAt: incidents.initialDueAt,
				intermediateDueAt: incidents.intermediateDueAt,
				finalDueAt: incidents.finalDueAt,
				initialReportedAt: incidents.initialReportedAt,
				intermediateReportedAt: incidents.intermediateReportedAt,
				finalReportedAt: incidents.finalReportedAt,
				ownerUserId: incidents.ownerUserId,
			})
			.from(incidents)
			.where(
				and(
					eq(incidents.organizationId, orgId),
					ne(incidents.status, "closed"),
				),
			),
		tx
			.select({
				id: products.id,
				code: products.code,
				name: products.name,
				supportUntil: products.supportUntil,
				ownerUserId: products.ownerUserId,
			})
			.from(products)
			.where(
				and(eq(products.organizationId, orgId), lte(products.supportUntil, to)),
			),
		tx
			.select({
				title: milestones.title,
				dueAt: milestones.dueAt,
				status: milestones.status,
				ownerUserId: milestones.ownerUserId,
			})
			.from(milestones)
			.where(
				and(eq(milestones.organizationId, orgId), isNotNull(milestones.dueAt)),
			),
	]);

	const out: DateSource[] = [];
	const push = (s: DateSource) => {
		if (s.date) out.push(s);
	};

	for (const r of runs)
		push({
			date: r.dueAt,
			kind: "obligation",
			title: r.title,
			href: "/kalender?tab=pflichten",
			ownerUserId: r.ownerUserId,
			done: r.status === "done" || r.status === "waived",
			note: r.periodLabel,
		});
	for (const c of upcomingLegalChanges(
		now,
		Math.ceil((toTs.getTime() - now.getTime()) / 86_400_000),
		frameworks,
	))
		push({
			date: c.date,
			kind: "legal",
			title: c.title,
			href: "/kalender?tab=rechtsaenderungen",
			note: c.legalBasis,
		});
	for (const d of docs)
		push({
			date: d.nextReviewAt,
			kind: "document_review",
			title: `${d.docNumber} ${d.title}`,
			href: `/dokumente/${d.docNumber}`,
			ownerUserId: d.ownerUserId,
		});
	for (const r of riskRows)
		push({
			date: r.reviewAt,
			kind: "risk_review",
			title: `${r.code} ${r.title}`,
			href: `/risiken/${r.id}`,
			ownerUserId: r.ownerUserId,
		});
	for (const c of impls)
		push({
			date: c.nextReviewAt,
			kind: "control_review",
			title: `${c.code} ${c.title}`,
			href: `/controls/${c.code}`,
			ownerUserId: c.ownerUserId,
		});
	for (const p of provs) {
		push({
			date: p.nextAssessmentAt,
			kind: "provider_assessment",
			title: p.name,
			href: `/dienstleister/${p.id}`,
			ownerUserId: p.ownerUserId,
			note: "Wiedervorlage Bewertung",
		});
		push({
			date: noticeDate(p.contractEnd, p.noticePeriodDays),
			kind: "provider_contract",
			title: p.name,
			href: `/dienstleister/${p.id}`,
			ownerUserId: p.ownerUserId,
			note: "letzter Kündigungstag",
		});
		push({
			date: p.contractEnd,
			kind: "provider_contract",
			title: p.name,
			href: `/dienstleister/${p.id}`,
			ownerUserId: p.ownerUserId,
			note: "Vertragsende",
		});
	}
	for (const a of approvals)
		push({
			date: iso(a.dueAt),
			kind: "approval",
			title: a.workflow,
			href: "/heute/freigaben",
			note: "SLA der Freigabe",
		});
	for (const d of decisions)
		push({
			date: d.dueAt,
			kind: "decision_request",
			title: `${d.code} ${d.question}`,
			href: "/beschluesse?tab=anfragen",
			ownerUserId: d.requestedByUserId,
		});
	for (const o of objs) {
		push({
			date: o.dueAt,
			kind: "objective_due",
			title: o.title,
			href: "/organisation?tab=ziele",
			ownerUserId: o.ownerUserId,
			note: "Zieltermin",
		});
		push({
			date: o.nextMeasureAt,
			kind: "objective_measure",
			title: o.title,
			href: "/organisation?tab=ziele",
			ownerUserId: o.ownerUserId,
			note: "Messung",
		});
	}
	for (const a of assetRows) {
		for (const [date, note] of [
			[a.supportEndAt, "Ende Sicherheitsupdates"],
			[a.endOfLifeAt, "Herstellerende (EOL)"],
			[a.maintenanceUntil, "Wartungsvertrag endet"],
		] as const)
			push({
				date,
				kind: "asset_lifecycle",
				title: a.name,
				href: "/assets",
				ownerUserId: a.ownerUserId,
				note,
			});
	}
	for (const a of auditRows)
		push({
			date: a.plannedAt ?? a.periodStart,
			kind: "audit",
			title: a.title,
			href: `/audits/${a.id}`,
			ownerUserId: a.ownerUserId,
			done: a.status === "reported" || a.status === "closed",
		});
	for (const r of reviews)
		push({
			date: r.heldAt,
			kind: "management_review",
			title: "Managementbewertung",
			href: "/managementbewertung",
			ownerUserId: r.ownerUserId,
			// abgehalten zählt als erledigt; offen bleibt nur die geplante
			done: r.status !== "planned",
		});
	for (const x of tests) {
		const title = x.code ? `${x.code} · ${x.method}` : x.method;
		if (!x.testedAt)
			push({
				date: x.plannedAt,
				kind: "test",
				title,
				href: "/testprogramm",
				ownerUserId: x.testerUserId,
			});
		push({
			date: x.nextTestAt,
			kind: "test",
			title,
			href: "/testprogramm",
			ownerUserId: x.testerUserId,
			note: "nächster Test",
		});
	}
	// Schulungen je Fälligkeitstag gebündelt
	const trainingByDay = new Map<string, number>();
	for (const a of trainings) {
		const d = iso(a.dueAt);
		if (d) trainingByDay.set(d, (trainingByDay.get(d) ?? 0) + 1);
	}
	for (const [date, n] of trainingByDay)
		push({
			date,
			kind: "training",
			title:
				n === 1 ? "Pflichtschulung fällig" : `${n} Pflichtschulungen fällig`,
			href: "/schulungen",
		});
	for (const n of ncs) {
		push({
			date: n.dueAt,
			kind: "nonconformity",
			title: `${n.code} ${n.title}`,
			href: `/abweichungen/${n.id}`,
			ownerUserId: n.ownerUserId,
			note: "Frist Korrekturmaßnahme",
		});
		if (n.status === "verified" || n.status === "in_progress")
			push({
				date: n.effectivenessCheckAt,
				kind: "nonconformity",
				title: `${n.code} ${n.title}`,
				href: `/abweichungen/${n.id}`,
				ownerUserId: n.ownerUserId,
				note: "Wirksamkeitsprüfung",
			});
	}
	for (const f of findings)
		push({
			date: iso(f.dueAt),
			kind: "security_finding",
			title: f.title,
			href: `/sicherheit/befunde/${f.id}`,
			ownerUserId: f.ownerUserId,
			note: f.severity === "critical" ? "kritisch" : "hoch",
		});
	for (const e of excs)
		push({
			date: iso(e.validUntil),
			kind: "exception",
			title: e.title,
			href: "/risiken?tab=ausnahmen",
			ownerUserId: e.ownerUserId,
			note: "Ausnahme läuft ab",
		});
	for (const p of policies)
		push({
			date: iso(p.validUntil),
			kind: "insurance",
			title: `${p.insurer}`,
			href: "/organisation?tab=versicherungen",
			ownerUserId: p.ownerUserId,
			note: "Versicherung läuft ab",
		});
	for (const d of dsrs)
		push({
			date: iso(d.extendedUntil ?? d.dueAt),
			kind: "dsr",
			title: "Betroffenenanfrage",
			href: "/datenschutz?tab=anfragen",
			ownerUserId: d.ownerUserId,
		});
	for (const i of incs) {
		for (const [due, reported, note] of [
			[i.initialDueAt, i.initialReportedAt, "Erstmeldung"],
			[i.intermediateDueAt, i.intermediateReportedAt, "Zwischenmeldung"],
			[i.finalDueAt, i.finalReportedAt, "Abschlussmeldung"],
		] as const)
			if (!reported)
				push({
					date: iso(due),
					kind: "incident_report",
					title: `${i.code} ${i.title}`,
					href: `/vorfaelle/${i.id}`,
					ownerUserId: i.ownerUserId,
					note,
				});
	}
	for (const p of prods)
		push({
			date: p.supportUntil,
			kind: "product_support",
			title: `${p.code} ${p.name}`,
			href: `/produkte/${p.id}`,
			ownerUserId: p.ownerUserId,
			note: "Supportzeitraum endet",
		});
	for (const m of mss)
		push({
			date: m.dueAt,
			kind: "milestone",
			title: m.title,
			href: "/roadmap",
			ownerUserId: m.ownerUserId,
			done: m.status === "done",
		});
	// alles bis `to`; collectDates filtert `from` und trägt Überfälliges mit
	return out;
}
