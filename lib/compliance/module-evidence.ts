import type { OrgTx } from "@/lib/db/with-org";
import { programmeCoverage } from "./audit-programme";
import {
	requiredResolutions,
	resolutionCoverage,
} from "./catalog/resolutions-required";
import { aggregateCases } from "./complaints";
import { capaState } from "./nonconformity";
import { runState } from "./obligations";
import { getOrgProfile } from "./queries";
import { listTrainings } from "./queries-p2";
import {
	dependencyMap,
	governanceStatus,
	listAllControlTests,
	listAuditProgrammes,
	listAudits,
	listCommunications,
	listInterestedParties,
	listManagementReviews,
	listNonconformities,
	listObjectives,
	listObligationRuns,
	listObligations,
	listProcesses,
	listResolutions,
	listScopes,
	listWhistleblowingReports,
} from "./queries-p3";
import { programmeStatus } from "./test-programme";
import { tlptStatus } from "./tlpt";

// Governance-Controls (CC-GOV/BCM/TST/INC) ziehen ihren Nachweis automatisch
// aus den Modulen der Managementsystem-Schicht: besetzte Pflichtfunktionen,
// gefasste Beschlüsse, letzte Managementbewertung, Auditprogramm, Abweichungen,
// Kommunikationsmatrix, Pflichten-Kalender, Prozesslandkarte, Testprogramm.
// Abgeleitet je Aufruf, nie gespeichert.

export type ModuleFact = { label: string; value: string; ok: boolean | null };
export type ModuleEvidence = {
	module: string;
	href: string;
	facts: ModuleFact[];
};

const MODULE_CONTROLS = new Set([
	"CC-GOV-02",
	"CC-GOV-03",
	"CC-GOV-04",
	"CC-GOV-05",
	"CC-GOV-06",
	"CC-GOV-07",
	"CC-GOV-09",
	"CC-GOV-10",
	"CC-GOV-11",
	"CC-GOV-16",
	"CC-BCM-02",
	"CC-BCM-05",
	"CC-TST-01",
	"CC-TST-02",
	"CC-INC-07",
]);

export function hasModuleEvidence(code: string): boolean {
	return MODULE_CONTROLS.has(code);
}

export async function moduleEvidenceFor(
	tx: OrgTx,
	orgId: string,
	code: string,
	now = new Date(),
): Promise<ModuleEvidence | null> {
	if (!MODULE_CONTROLS.has(code)) return null;
	const profile = await getOrgProfile(tx, orgId);
	const fws = profile?.frameworks ?? [];
	const stage = profile?.profile.licenceStage ?? "0_vorbereitung";
	const year = now.getUTCFullYear();

	switch (code) {
		case "CC-GOV-02":
		case "CC-GOV-11": {
			const gov = await governanceStatus(tx, orgId, fws, stage);
			const filled = gov.coverage.items.filter((i) => i.filled).length;
			const blocks = gov.sod.filter((v) => v.rule.severity === "block").length;
			return {
				module: "Organisation · Rollen & Leitung",
				href: "/organisation?tab=rollen",
				facts: [
					{
						label: "Pflichtfunktionen besetzt",
						value: `${filled}/${gov.required.length}`,
						ok: gov.coverage.gaps.length === 0 && gov.required.length > 0,
					},
					{
						label: "Vertretung fehlt",
						value: String(
							gov.coverage.items.filter((i) => i.deputyMissing).length,
						),
						ok: gov.coverage.items.every((i) => !i.deputyMissing),
					},
					{
						label: "Funktionstrennung verletzt (blockierend)",
						value: String(blocks),
						ok: blocks === 0,
					},
				],
			};
		}
		case "CC-GOV-03": {
			const res = await listResolutions(tx, orgId);
			const cov = resolutionCoverage(
				requiredResolutions(fws, stage),
				res
					.filter((r) => r.effective)
					.map((r) => ({
						requiredCode: r.requiredCode,
						date: r.date,
						resolutionNumber: r.resolutionNumber,
					})),
				now,
			);
			return {
				module: "Beschlüsse",
				href: "/beschluesse?tab=pflicht",
				facts: [
					{
						label: "Pflichtbeschlüsse gefasst",
						value: `${cov.items.length - cov.gaps.length}/${cov.items.length}`,
						ok: cov.gaps.length === 0 && cov.items.length > 0,
					},
					{
						label: "Beschlüsse im Register",
						value: String(res.length),
						ok: null,
					},
				],
			};
		}
		case "CC-GOV-04": {
			const [parties, scopes] = await Promise.all([
				listInterestedParties(tx, orgId),
				listScopes(tx, orgId),
			]);
			const approved = scopes.filter((s) => s.status === "approved").length;
			return {
				module: "Organisation · Kontext & Geltungsbereich",
				href: "/organisation?tab=geltungsbereich",
				facts: [
					{
						label: "Interessierte Parteien",
						value: String(parties.length),
						ok: parties.length > 0,
					},
					{
						label: "Geltungsbereiche freigegeben",
						value: `${approved}/${scopes.length}`,
						ok: approved > 0,
					},
				],
			};
		}
		case "CC-GOV-05": {
			const [reviews, objectives] = await Promise.all([
				listManagementReviews(tx, orgId),
				listObjectives(tx, orgId),
			]);
			const done = reviews
				.filter((r) => r.status === "done")
				.sort((a, b) => b.heldAt.localeCompare(a.heldAt));
			const last = done[0];
			const yearAgo = new Date(now);
			yearAgo.setFullYear(yearAgo.getFullYear() - 1);
			return {
				module: "Managementbewertung · Ziele & KPIs",
				href: "/managementbewertung",
				facts: [
					{
						label: "Letzte Managementbewertung",
						value: last ? last.heldAt : "—",
						ok: Boolean(last && new Date(last.heldAt) >= yearAgo),
					},
					{
						label: "Ziele mit Messung",
						value: `${objectives.filter((o) => o.measurements.length > 0).length}/${objectives.length}`,
						ok: objectives.length > 0,
					},
				],
			};
		}
		case "CC-GOV-06": {
			const [progs, audits, procs] = await Promise.all([
				listAuditProgrammes(tx, orgId),
				listAudits(tx, orgId),
				listProcesses(tx, orgId),
			]);
			const prog = progs[0];
			const cov = prog
				? programmeCoverage(prog, prog.items, {
						domains: [],
						processes: procs
							.filter((p) => p.criticality !== "standard")
							.map((p) => ({ code: p.code, name: p.name })),
						providers: [],
					})
				: null;
			const thisYear = audits.filter((a) =>
				(a.performedAt ?? a.plannedAt ?? "").startsWith(String(year)),
			);
			return {
				module: "Audits",
				href: "/audits",
				facts: [
					{
						label: "Auditprogramm",
						value: prog ? `${cov?.cycleStartYear}–${cov?.cycleEndYear}` : "—",
						ok: Boolean(prog),
					},
					{
						label: "Audits im laufenden Jahr",
						value: String(thisYear.length),
						ok: thisYear.length > 0,
					},
					{
						label: "Offene Findings",
						value: String(audits.reduce((n, a) => n + a.findingsOpen, 0)),
						ok: null,
					},
				],
			};
		}
		case "CC-GOV-07": {
			const ncs = await listNonconformities(tx, orgId);
			const open = ncs.filter((n) => n.status !== "closed");
			const overdue = ncs.filter((n) => capaState(n, now).overdue);
			return {
				module: "Abweichungen (CAPA)",
				href: "/abweichungen",
				facts: [
					{ label: "Abweichungen offen", value: String(open.length), ok: null },
					{
						label: "Überfällig",
						value: String(overdue.length),
						ok: overdue.length === 0,
					},
					{
						label: "Mit Wirksamkeitsprüfung geschlossen",
						value: String(
							ncs.filter(
								(n) =>
									n.status === "closed" &&
									n.effectivenessResult === "effective",
							).length,
						),
						ok: null,
					},
				],
			};
		}
		case "CC-GOV-09": {
			const comms = await listCommunications(tx, orgId);
			const crisis = comms.filter(
				(c) => c.trigger === "crisis" || c.trigger === "incident",
			);
			return {
				module: "Organisation · Kommunikation",
				href: "/organisation?tab=kommunikation",
				facts: [
					{
						label: "Kommunikationswege",
						value: String(comms.length),
						ok: comms.length > 0,
					},
					{
						label: "Vorfall-/Krisenkanäle mit Kontakt",
						value: `${crisis.filter((c) => c.contact).length}/${crisis.length}`,
						ok: crisis.length > 0,
					},
				],
			};
		}
		case "CC-GOV-10": {
			const [obls, runs] = await Promise.all([
				listObligations(tx, orgId),
				listObligationRuns(tx, orgId),
			]);
			const active = obls.filter((o) => o.active);
			const overdue = runs.filter(
				(r) => runState(r, r.leadDays, now) === "overdue",
			);
			return {
				module: "Kalender",
				href: "/kalender",
				facts: [
					{
						label: "Aktive Pflichten",
						value: String(active.length),
						ok: active.length > 0,
					},
					{
						label: "Ohne Verantwortliche:n",
						value: String(active.filter((o) => !o.ownerUserId).length),
						ok: active.every((o) => o.ownerUserId),
					},
					{
						label: "Läufe überfällig",
						value: String(overdue.length),
						ok: overdue.length === 0,
					},
				],
			};
		}
		case "CC-GOV-16": {
			const trainings = await listTrainings(tx, orgId);
			const yearAgo = new Date(now);
			yearAgo.setFullYear(yearAgo.getFullYear() - 1);
			const mgmt = trainings.filter(
				(t) => t.audience === "management" && new Date(t.heldAt) >= yearAgo,
			);
			return {
				module: "Schulungen",
				href: "/schulungen",
				facts: [
					{
						label: "Leitungsschulungen (12 Monate)",
						value: String(mgmt.length),
						ok: mgmt.length > 0,
					},
				],
			};
		}
		case "CC-BCM-02": {
			const [procs, deps] = await Promise.all([
				listProcesses(tx, orgId),
				dependencyMap(tx, orgId),
			]);
			const critical = procs.filter(
				(p) => p.status !== "retired" && p.criticality !== "standard",
			);
			const withBia = critical.filter(
				(p) => p.rtoHours !== null && p.rpoHours !== null,
			);
			const mapped = deps.filter(
				(d) => d.criticality !== "standard" && d.assets.length > 0,
			);
			return {
				module: "Prozesse · Kritische Funktionen",
				href: "/prozesse?tab=kritisch",
				facts: [
					{
						label: "Kritische Prozesse mit RTO/RPO",
						value: `${withBia.length}/${critical.length}`,
						ok: critical.length > 0 && withBia.length === critical.length,
					},
					{
						label: "Mit Systemen verknüpft (Abhängigkeitskarte)",
						value: `${mapped.length}/${critical.length}`,
						ok: critical.length > 0 && mapped.length === critical.length,
					},
				],
			};
		}
		case "CC-BCM-05":
		case "CC-TST-01": {
			const [tests, procs] = await Promise.all([
				listAllControlTests(tx, orgId),
				listProcesses(tx, orgId),
			]);
			const critical = procs.filter(
				(p) => p.status !== "retired" && p.criticality !== "standard",
			);
			const st = programmeStatus(year, tests, critical, now);
			return {
				module: "Testprogramm",
				href: "/testprogramm",
				facts:
					code === "CC-BCM-05"
						? [
								{
									label: "BCM-Übungen je kritischem Prozess",
									value: `${critical.length - st.bcmGaps.length}/${critical.length}`,
									ok: critical.length > 0 && st.bcmGaps.length === 0,
								},
							]
						: [
								{
									label: "Tests durchgeführt (Jahr)",
									value: String(st.performed),
									ok: st.performed > 0,
								},
								{
									label: "Pentest (Jahr)",
									value: st.pentestDone ? "ja" : "nein",
									ok: st.pentestDone,
								},
								{
									label: "Geplant, überfällig",
									value: String(st.overduePlanned),
									ok: st.overduePlanned === 0,
								},
							],
			};
		}
		case "CC-TST-02": {
			const tests = await listAllControlTests(tx, orgId);
			const last = tests
				.filter((t) => t.method === "tlpt" && t.testedAt)
				.map((t) => t.testedAt as Date)
				.sort((a, b) => b.getTime() - a.getTime())[0];
			const s = tlptStatus({
				designated: Boolean(profile?.profile.tlptDesignated),
				lastTlptAt: last ?? null,
				now,
			});
			return {
				module: "Testprogramm · TLPT",
				href: "/testprogramm",
				facts: [
					{
						label: "Benennung durch BaFin",
						value:
							s.state === "not_applicable" ? "nein (Negativnachweis)" : "ja",
						ok: null,
					},
					{
						label: "TLPT-Zyklus",
						value: s.dueAt
							? `fällig ${s.dueAt.toISOString().slice(0, 10)}`
							: s.state,
						ok: s.state === "not_applicable" || s.state === "ok",
					},
				],
			};
		}
		case "CC-INC-07": {
			const reports = await listWhistleblowingReports(tx, orgId);
			const agg = aggregateCases(
				reports,
				now,
				(r) => r.feedbackDueAt,
				(r) => r.feedbackAt,
			);
			return {
				module: "Beschwerden & Hinweise",
				href: "/beschwerden?tab=hinweise",
				facts: [
					{
						label: "Hinweise (letzte 90 Tage)",
						value: String(agg.last90Days),
						ok: null,
					},
					{
						label: "Bestätigung überfällig",
						value: String(agg.ackOverdue),
						ok: agg.ackOverdue === 0,
					},
					{
						label: "Rückmeldung überfällig",
						value: String(agg.responseOverdue),
						ok: agg.responseOverdue === 0,
					},
				],
			};
		}
		default:
			return null;
	}
}
