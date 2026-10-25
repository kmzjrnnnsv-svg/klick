import type { ImplStatus } from "@/db/schema/enums";
import { type Edge, edgeStatus, type ReqCoverage } from "./coverage";

// Prüfungsreife je Rahmenwerk (und je Audit) zu einem Stichtag — rein,
// abgeleitet, nie gespeichert. Abdeckung allein sagt „umgesetzt laut
// Status“; eine Prüfung fragt zusätzlich: belegt (Nachweis gültig am
// Stichtag)? wirksam (frischer Test)? dokumentiert (Pflichtdokumente)?
// offene Abweichungen/Findings? Daraus Score, Urteil und eine geordnete
// Liste „Was fehlt bis zur Prüfung“ mit Punktgewinn je Schritt.
//
// Je anwendbare Anforderung q (Status aus deriveCoverage am Stichtag):
//   c(q) = 1 covered · 0,5 partial · 0 open
//   K(q) = Controls, deren Kante den Status trägt
//   E(k) = gültiger Nachweis am Stichtag (createdAt ≤ asOf, validUntil ≥ asOf)
//   T(k) = frischer Test (≤ testMaxAgeMonths oder nextTestAt ≥ asOf):
//          pass 1 · partial 0,5 · sonst 0; Controls mit Prüfmethode
//          inspection/interview brauchen keinen Test (T = 1)
//   d(q) = max über K(q) von 0,3·E + 0,2·T
//   r(q) = c(q) · (0,5 + d(q))   → „umgesetzt, aber nicht belegt“ = 0,5
// Basis = Mittel r(q); Dokumente = vorhandene/geforderte Pflichtdokumente.
// Roh = 100 · (0,85 · Basis + 0,15 · Dokumente) (ohne Pflichtdokumente
// 100 · Basis), minus gedeckelte Abzüge für offene Abweichungen, Findings,
// Sicherheitsbefunde. Audit: zusätzlich 15 % PBC-Stand.

export type ReadinessPolicy = {
	testMaxAgeMonths: number;
	weightCoverage: number;
	weightDocs: number;
	penaltyCaps: { nonconformities: number; findings: number; security: number };
	thresholds: { ready: number; almost: number; maxCriticalAlmost: number };
	pbcWeight: number;
};

export const READINESS_POLICY: ReadinessPolicy = {
	testMaxAgeMonths: 12,
	weightCoverage: 0.85,
	weightDocs: 0.15,
	penaltyCaps: { nonconformities: 20, findings: 15, security: 15 },
	thresholds: { ready: 85, almost: 65, maxCriticalAlmost: 2 },
	pbcWeight: 0.15,
};

export type BlockerSeverity = "critical" | "high" | "medium" | "low";

export type BlockerKind =
	| "control_not_implemented"
	| "evidence_missing"
	| "test_missing"
	| "test_failed"
	| "document_missing"
	| "document_not_approved"
	| "document_review_overdue"
	| "nc_open"
	| "finding_open"
	| "pbc_open"
	| "pbc_rejected"
	| "product_gap"
	| "security_finding"
	// Freigabe-Pflicht eines Rahmenwerks nicht abgedeckt (ADR-024)
	| "governance_gap";

export type ReadinessBlocker = {
	kind: BlockerKind;
	severity: BlockerSeverity;
	// Anzeigename der betroffenen Sache (Control-Titel, Dokument, Abweichung …)
	label: string;
	// Kennung für Link und Dedupe (Control-Code, Template-Code, ID)
	ref: string;
	href: string;
	requirements: number;
	gain: number;
	dueAt?: string | null;
};

export type ReadinessControl = {
	title: string;
	effort: "S" | "M" | "L";
	implStatus: ImplStatus;
	testRequired: boolean;
	evidence: readonly { validUntil: string | null; createdAt: Date }[];
	tests: readonly {
		testedAt: Date | null;
		result: "pass" | "partial" | "fail" | null;
		nextTestAt: string | null;
	}[];
};

export type ReadinessInput = {
	framework: string;
	asOf: Date;
	requirements: readonly {
		key: string;
		sectionCode?: string | null;
		status: ReqCoverage;
	}[];
	edges: readonly Edge[];
	controls: ReadonlyMap<string, ReadinessControl>;
	mandatoryDocs: readonly {
		templateCode: string;
		title: string;
		doc: {
			docNumber: string;
			status: string;
			nextReviewAt: string | null;
		} | null;
	}[];
	nonconformities: readonly {
		id: string;
		code: string;
		title: string;
		status: string;
		priority: string | null;
		dueAt: string | null;
		// leer = Org-weit (gilt für jedes Rahmenwerk)
		controlCodes: readonly string[];
	}[];
	findings: readonly {
		id: string;
		auditId: string;
		title: string;
		severity: string;
		status: string;
		controlCode: string | null;
		requirementKey: string | null;
	}[];
	securityFindings?: readonly {
		id: string;
		title: string;
		severity: string;
		controlCode: string | null;
		dueAt: string | null;
	}[];
	pbc?: {
		total: number;
		answered: number;
		accepted: number;
		open: readonly { id: string; title: string; dueAt: string | null }[];
		rejected: readonly { id: string; title: string }[];
	};
	extraBlockers?: readonly ReadinessBlocker[];
	policy?: ReadinessPolicy;
};

export type ReadinessVerdict = "ready" | "almost" | "not_ready" | "n_a";

export type ReadinessResult = {
	framework: string;
	asOf: string;
	applicable: number;
	score: number | null;
	verdict: ReadinessVerdict;
	counts: { covered: number; partial: number; open: number };
	dimensions: {
		coverage: number | null;
		evidence: number | null;
		tests: number | null;
		documents: number | null;
	};
	penalty: {
		nonconformities: number;
		findings: number;
		security: number;
		total: number;
	};
	bySection: { sectionCode: string; score: number; applicable: number }[];
	blockers: ReadinessBlocker[];
	criticalBlockers: number;
};

const C: Record<ReqCoverage, number> = {
	covered: 1,
	partial: 0.5,
	open: 0,
	not_applicable: 0,
};
const SEV_RANK: Record<BlockerSeverity, number> = {
	critical: 0,
	high: 1,
	medium: 2,
	low: 3,
};
const EFFORT: Record<"S" | "M" | "L", number> = { S: 1, M: 2, L: 3 };

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const round1 = (n: number) => Math.round(n * 10) / 10;

function monthsBefore(d: Date, months: number): Date {
	const out = new Date(d);
	out.setUTCMonth(out.getUTCMonth() - months);
	return out;
}

export function evidenceValid(
	c: Pick<ReadinessControl, "evidence">,
	asOf: Date,
): boolean {
	const day = isoDate(asOf);
	return c.evidence.some(
		(e) => e.createdAt <= asOf && (!e.validUntil || e.validUntil >= day),
	);
}

export type TestState = "ok" | "partial" | "failed" | "missing" | "not_needed";

export function testState(
	c: Pick<ReadinessControl, "tests" | "testRequired">,
	asOf: Date,
	maxAgeMonths: number,
): TestState {
	if (!c.testRequired) return "not_needed";
	const done = c.tests
		.filter((t) => t.testedAt && t.testedAt <= asOf && t.result)
		.sort(
			(a, b) => (b.testedAt?.getTime() ?? 0) - (a.testedAt?.getTime() ?? 0),
		);
	const last = done[0];
	if (!last?.testedAt) return "missing";
	if (last.result === "fail") return "failed";
	const fresh =
		last.testedAt >= monthsBefore(asOf, maxAgeMonths) ||
		(last.nextTestAt !== null && last.nextTestAt >= isoDate(asOf));
	if (!fresh) return "missing";
	return last.result === "pass" ? "ok" : "partial";
}

const T_VALUE: Record<TestState, number> = {
	ok: 1,
	not_needed: 1,
	partial: 0.5,
	failed: 0,
	missing: 0,
};

export function deriveReadiness(input: ReadinessInput): ReadinessResult {
	const policy = input.policy ?? READINESS_POLICY;
	const asOf = input.asOf;
	const day = isoDate(asOf);
	const edgesByReq = new Map<string, Edge[]>();
	for (const e of input.edges) {
		const list = edgesByReq.get(e.requirement) ?? [];
		list.push(e);
		edgesByReq.set(e.requirement, list);
	}
	const applicable = input.requirements.filter(
		(r) => r.status !== "not_applicable",
	);
	const n = applicable.length;
	const frameworkControls = new Set(input.edges.map((e) => e.control));

	// Je Control: Zustand einmal rechnen.
	const ev = new Map<string, boolean>();
	const ts = new Map<string, TestState>();
	for (const [code, c] of input.controls) {
		ev.set(code, evidenceValid(c, asOf));
		ts.set(code, testState(c, asOf, policy.testMaxAgeMonths));
	}

	type Agg = { gain: number; requirements: number };
	const notImpl = new Map<string, Agg>();
	const noEvidence = new Map<string, Agg>();
	const noTest = new Map<string, Agg>();
	const failed = new Set<string>();
	const bump = (m: Map<string, Agg>, code: string, gain: number) => {
		const a = m.get(code) ?? { gain: 0, requirements: 0 };
		a.gain += gain;
		a.requirements += 1;
		m.set(code, a);
	};
	// Punkte je Anforderung: ohne Pflichtdokumente trägt die Abdeckung allein.
	const required = input.mandatoryDocs.length;
	const weight =
		n > 0 ? (100 * (required > 0 ? policy.weightCoverage : 1)) / n : 0;

	let sumR = 0;
	let carryingEvidence = 0;
	let carryingTests = 0;
	const sections = new Map<string, { sum: number; n: number }>();
	const counts = { covered: 0, partial: 0, open: 0 };
	for (const q of applicable) {
		const status = q.status as Exclude<ReqCoverage, "not_applicable">;
		counts[status] += 1;
		const c = C[status];
		const edges = edgesByReq.get(q.key) ?? [];
		const carrying = edges.filter((e) => {
			const impl = input.controls.get(e.control)?.implStatus ?? "not_started";
			return edgeStatus(e.coverage, impl) === status;
		});
		let d = 0;
		for (const e of carrying) {
			const E = ev.get(e.control) ? 1 : 0;
			const T = T_VALUE[ts.get(e.control) ?? "missing"];
			d = Math.max(d, 0.3 * E + 0.2 * T);
		}
		const r = c * (0.5 + d);
		sumR += r;
		const sec = q.sectionCode ?? "";
		const s = sections.get(sec) ?? { sum: 0, n: 0 };
		s.sum += r;
		s.n += 1;
		sections.set(sec, s);

		if (c > 0 && carrying.length > 0) {
			if (carrying.some((e) => ev.get(e.control))) carryingEvidence += 1;
			if (
				carrying.some((e) => {
					const st = ts.get(e.control);
					return st === "ok" || st === "not_needed";
				})
			)
				carryingTests += 1;
		}

		// Blocker: was hebt r(q) am meisten?
		if (status !== "covered") {
			// bestes noch nicht umgesetztes Control: volle Kante, wenig Aufwand
			const candidates = edges
				.filter(
					(e) => input.controls.get(e.control)?.implStatus !== "implemented",
				)
				.sort(
					(a, b) =>
						(a.coverage === "full" ? 0 : 1) - (b.coverage === "full" ? 0 : 1) ||
						EFFORT[input.controls.get(a.control)?.effort ?? "M"] -
							EFFORT[input.controls.get(b.control)?.effort ?? "M"] ||
						a.control.localeCompare(b.control),
				);
			const best = candidates[0];
			if (best) {
				const target = best.coverage === "full" ? 1 : 0.5;
				bump(notImpl, best.control, Math.max(0, target - r) * weight);
			}
		}
		if (c > 0) {
			const anyE = carrying.some((e) => ev.get(e.control));
			if (!anyE) {
				const k = carrying[0];
				if (k) bump(noEvidence, k.control, c * 0.3 * weight);
			}
			const anyT = carrying.some((e) => {
				const st = ts.get(e.control);
				return st === "ok" || st === "not_needed";
			});
			if (!anyT) {
				const k = carrying.find((e) => ts.get(e.control) !== "failed");
				if (k) bump(noTest, k.control, c * 0.2 * weight);
			}
		}
	}
	for (const code of frameworkControls) {
		if (ts.get(code) === "failed") failed.add(code);
	}

	// Pflichtdokumente
	const blockers: ReadinessBlocker[] = [];
	let present = 0;
	for (const m of input.mandatoryDocs) {
		const ok =
			m.doc &&
			(m.doc.status === "approved" || m.doc.status === "published") &&
			(!m.doc.nextReviewAt || m.doc.nextReviewAt >= day);
		if (ok) {
			present += 1;
			continue;
		}
		const docGain = required > 0 ? (100 * policy.weightDocs) / required : 0;
		if (!m.doc) {
			blockers.push({
				kind: "document_missing",
				severity: "critical",
				label: m.title,
				ref: m.templateCode,
				href: "/dokumente",
				requirements: 0,
				gain: docGain,
			});
		} else if (m.doc.status !== "approved" && m.doc.status !== "published") {
			blockers.push({
				kind: "document_not_approved",
				severity: "high",
				label: m.title,
				ref: m.doc.docNumber,
				href: `/dokumente/${m.doc.docNumber}`,
				requirements: 0,
				gain: docGain,
			});
		} else {
			blockers.push({
				kind: "document_review_overdue",
				severity: "medium",
				label: m.title,
				ref: m.doc.docNumber,
				href: `/dokumente/${m.doc.docNumber}`,
				requirements: 0,
				gain: docGain,
				dueAt: m.doc.nextReviewAt,
			});
		}
	}

	const title = (code: string) => input.controls.get(code)?.title ?? code;
	for (const [code, a] of notImpl)
		blockers.push({
			kind: "control_not_implemented",
			severity: "high",
			label: `${code} ${title(code)}`,
			ref: code,
			href: `/controls/${code}`,
			requirements: a.requirements,
			gain: a.gain,
		});
	for (const [code, a] of noEvidence)
		blockers.push({
			kind: "evidence_missing",
			severity: "high",
			label: `${code} ${title(code)}`,
			ref: code,
			href: `/controls/${code}`,
			requirements: a.requirements,
			gain: a.gain,
		});
	for (const [code, a] of noTest)
		blockers.push({
			kind: "test_missing",
			severity: "medium",
			label: `${code} ${title(code)}`,
			ref: code,
			href: `/controls/${code}`,
			requirements: a.requirements,
			gain: a.gain,
		});
	for (const code of failed)
		blockers.push({
			kind: "test_failed",
			severity: "critical",
			label: `${code} ${title(code)}`,
			ref: code,
			href: `/controls/${code}`,
			requirements: 0,
			gain: 0,
		});

	// Abweichungen: offen, Rahmenwerk betroffen (über Controls) oder Org-weit
	let ncPenalty = 0;
	for (const nc of input.nonconformities) {
		if (nc.status === "closed" || nc.status === "verified") continue;
		if (
			nc.controlCodes.length > 0 &&
			!nc.controlCodes.some((c) => frameworkControls.has(c))
		)
			continue;
		const severe =
			nc.priority === "critical" ||
			nc.priority === "high" ||
			(nc.dueAt !== null && nc.dueAt < day);
		const p = severe ? 5 : 2;
		ncPenalty += p;
		blockers.push({
			kind: "nc_open",
			severity: severe ? "critical" : "medium",
			label: `${nc.code} ${nc.title}`,
			ref: nc.id,
			href: `/abweichungen/${nc.id}`,
			requirements: 0,
			gain: p,
			dueAt: nc.dueAt,
		});
	}
	ncPenalty = Math.min(ncPenalty, policy.penaltyCaps.nonconformities);

	// Audit-Findings im Rahmenwerk
	const reqKeys = new Set(input.requirements.map((r) => r.key));
	let findingPenalty = 0;
	for (const f of input.findings) {
		if (f.status === "closed") continue;
		const inScope =
			(f.requirementKey !== null && reqKeys.has(f.requirementKey)) ||
			(f.controlCode !== null && frameworkControls.has(f.controlCode));
		if (!inScope) continue;
		const p =
			f.severity === "critical" || f.severity === "major"
				? 5
				: f.severity === "minor"
					? 2
					: 0;
		findingPenalty += p;
		blockers.push({
			kind: "finding_open",
			severity:
				f.severity === "critical"
					? "critical"
					: f.severity === "major"
						? "high"
						: f.severity === "minor"
							? "medium"
							: "low",
			label: f.title,
			ref: f.id,
			href: `/audits/${f.auditId}?tab=findings`,
			requirements: 0,
			gain: p,
		});
	}
	findingPenalty = Math.min(findingPenalty, policy.penaltyCaps.findings);

	// Sicherheitsbefunde (Scan-Import, Pentest) auf Controls des Rahmenwerks
	let secPenalty = 0;
	for (const s of input.securityFindings ?? []) {
		if (s.controlCode !== null && !frameworkControls.has(s.controlCode))
			continue;
		const p = s.severity === "critical" ? 5 : s.severity === "high" ? 3 : 0;
		if (p === 0) continue;
		secPenalty += p;
		blockers.push({
			kind: "security_finding",
			severity: s.severity === "critical" ? "critical" : "high",
			label: s.title,
			ref: s.id,
			href: `/sicherheit/befunde/${s.id}`,
			requirements: 0,
			gain: p,
			dueAt: s.dueAt,
		});
	}
	secPenalty = Math.min(secPenalty, policy.penaltyCaps.security);

	for (const r of input.pbc?.open ?? [])
		blockers.push({
			kind: "pbc_open",
			severity: "high",
			label: r.title,
			ref: r.id,
			href: "",
			requirements: 0,
			gain: 0,
			dueAt: r.dueAt,
		});
	for (const r of input.pbc?.rejected ?? [])
		blockers.push({
			kind: "pbc_rejected",
			severity: "high",
			label: r.title,
			ref: r.id,
			href: "",
			requirements: 0,
			gain: 0,
		});
	blockers.push(...(input.extraBlockers ?? []));

	blockers.sort(
		(a, b) =>
			SEV_RANK[a.severity] - SEV_RANK[b.severity] ||
			b.gain - a.gain ||
			(a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999") ||
			a.label.localeCompare(b.label),
	);
	for (const b of blockers) b.gain = round1(b.gain);

	const penaltyTotal = ncPenalty + findingPenalty + secPenalty;
	const criticalBlockers = blockers.filter(
		(b) => b.severity === "critical",
	).length;
	let score: number | null = null;
	let verdict: ReadinessVerdict = "n_a";
	if (n > 0) {
		const base = sumR / n;
		const raw =
			required > 0
				? 100 *
					(policy.weightCoverage * base +
						policy.weightDocs * (present / required))
				: 100 * base;
		let s = raw - penaltyTotal;
		if (input.pbc && input.pbc.total > 0) {
			const pbcScore =
				(100 * (input.pbc.accepted + 0.5 * input.pbc.answered)) /
				input.pbc.total;
			s = (1 - policy.pbcWeight) * s + policy.pbcWeight * pbcScore;
		}
		score = Math.max(0, Math.min(100, Math.round(s)));
		const t = policy.thresholds;
		verdict =
			score >= t.ready && criticalBlockers === 0
				? "ready"
				: score >= t.almost && criticalBlockers <= t.maxCriticalAlmost
					? "almost"
					: "not_ready";
	}

	const pct = (a: number, b: number) => (b > 0 ? round1((100 * a) / b) : null);
	return {
		framework: input.framework,
		asOf: day,
		applicable: n,
		score,
		verdict,
		counts,
		dimensions: {
			coverage: pct(counts.covered + 0.5 * counts.partial, n),
			// Anteil aller anwendbaren Anforderungen, die belegt bzw. wirksam
			// getestet sind — nicht nur der umgesetzten (sonst 100 % bei 3 %
			// Abdeckung).
			evidence: pct(carryingEvidence, n),
			tests: pct(carryingTests, n),
			documents: pct(present, required),
		},
		penalty: {
			nonconformities: ncPenalty,
			findings: findingPenalty,
			security: secPenalty,
			total: penaltyTotal,
		},
		bySection: [...sections]
			.map(([sectionCode, s]) => ({
				sectionCode,
				score: Math.round((100 * s.sum) / s.n),
				applicable: s.n,
			}))
			.sort((a, b) => a.sectionCode.localeCompare(b.sectionCode)),
		blockers,
		criticalBlockers,
	};
}

// Mehrere Rahmenwerke (ein Audit): Score gewichtet nach anwendbaren
// Anforderungen; Blocker zusammengeführt (Control-Blocker einmal je Control).
export function combineReadiness(
	results: readonly ReadinessResult[],
	policy: ReadinessPolicy = READINESS_POLICY,
): Pick<
	ReadinessResult,
	"score" | "verdict" | "blockers" | "criticalBlockers"
> {
	const scored = results.filter((r) => r.score !== null && r.applicable > 0);
	if (scored.length === 0)
		return { score: null, verdict: "n_a", blockers: [], criticalBlockers: 0 };
	const total = scored.reduce((s, r) => s + r.applicable, 0);
	const score = Math.round(
		scored.reduce((s, r) => s + (r.score ?? 0) * r.applicable, 0) / total,
	);
	const seen = new Map<string, ReadinessBlocker>();
	for (const r of scored)
		for (const b of r.blockers) {
			const key = `${b.kind}:${b.ref}`;
			const prev = seen.get(key);
			if (!prev) seen.set(key, { ...b });
			else {
				prev.gain = round1(prev.gain + b.gain);
				prev.requirements += b.requirements;
			}
		}
	const blockers = [...seen.values()].sort(
		(a, b) =>
			SEV_RANK[a.severity] - SEV_RANK[b.severity] ||
			b.gain - a.gain ||
			a.label.localeCompare(b.label),
	);
	const criticalBlockers = blockers.filter(
		(b) => b.severity === "critical",
	).length;
	const t = policy.thresholds;
	const verdict: ReadinessVerdict =
		score >= t.ready && criticalBlockers === 0
			? "ready"
			: score >= t.almost && criticalBlockers <= t.maxCriticalAlmost
				? "almost"
				: "not_ready";
	return { score, verdict, blockers, criticalBlockers };
}

// Stichtage, die für ein Rahmenwerk Sinn ergeben: heute, geplante Audits,
// jedes künftige Inkrafttreten (z. B. CRA 2027-12-11, AMLR 2027-07-10).
export function stichtagOptions(
	effectiveFroms: readonly (string | null | undefined)[],
	today: Date,
	auditDates: readonly (string | null | undefined)[] = [],
): string[] {
	const t = isoDate(today);
	const set = new Set<string>([t]);
	for (const d of [...effectiveFroms, ...auditDates])
		if (d && d > t) set.add(d.slice(0, 10));
	return [...set].sort();
}

// ?stichtag=YYYY-MM-DD aus der URL; ungültig oder leer → heute.
export function parseStichtag(v: string | undefined, today: Date): Date {
	if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
		const d = new Date(`${v}T12:00:00Z`);
		if (!Number.isNaN(d.getTime())) return d;
	}
	return today;
}
