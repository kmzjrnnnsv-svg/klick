"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { bcmExercises, bcmPlans, processes, sites, tasks } from "@/db/schema";
import type { ProcessBia } from "@/db/schema/registers";
import { safeAction } from "@/lib/actions/safe";
import { GateBlocked } from "@/lib/approvals/gate-error";
import { gateApproval } from "@/lib/approvals/service";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { normalizeBia, suggestTargets } from "@/lib/bcm/bia";
import {
	exerciseControl,
	exerciseOutcome,
	formatMinutes,
	normalizeExercise,
	seedScript,
} from "@/lib/bcm/exercise";
import {
	normalizePlan,
	planIssues,
	releasable,
	reviewDate,
} from "@/lib/bcm/plan";
import { insertControlTest } from "@/lib/compliance/control-test-service";
import { isFunctionKey } from "@/lib/compliance/function-key";
import { userNames } from "@/lib/compliance/queries";
import { levelCount } from "@/lib/compliance/risk-method";
import { mutateOrg, type OrgTx } from "@/lib/db/with-org";
import { implementationFor } from "@/lib/evidence-studio/implementation";
import { orgRiskMethod } from "@/lib/org/queries";
import {
	completeBcmExerciseSchema,
	createBcmExerciseSchema,
	releaseBcmPlanSchema,
	saveBcmExerciseSchema,
	saveBcmPlanSchema,
	saveBiaSchema,
} from "@/lib/validation/bcm";
import { type ActionResult, fromZod } from "@/lib/validation/common";

// Notfallmanagement: Aktionen rund um BIA, Notfallpläne und Übungen.

type SaveBiaResult = ActionResult<{
	code: string;
	adopted: boolean;
	approvalPending: boolean;
}>;

// Geführte BIA speichern; mit adopt übernimmt der Prozess den Vorschlag
// (RTO, RPO, MTPD, auf Wunsch Kritikalität). Der Vorschlag wird hier neu
// gerechnet, nie aus der Eingabe übernommen.
async function saveProcessBiaImpl(input: unknown): Promise<SaveBiaResult> {
	const c = await requireOrg({ process: ["update"] });
	const parsed = saveBiaSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	let out: SaveBiaResult;
	try {
		out = await mutateOrg<SaveBiaResult>(toOrgCtx(c), async (tx) => {
			const [before] = await tx
				.select({
					id: processes.id,
					code: processes.code,
					name: processes.name,
					status: processes.status,
					criticality: processes.criticality,
					ownerUserId: processes.ownerUserId,
					rtoHours: processes.rtoHours,
					rpoHours: processes.rpoHours,
					mtpdHours: processes.mtpdHours,
				})
				.from(processes)
				.where(
					and(
						eq(processes.id, d.processId),
						eq(processes.organizationId, c.orgId),
					),
				)
				.limit(1);
			if (!before)
				return { result: { ok: false, error: "notFound" }, audit: [] };
			const method = await orgRiskMethod(tx, c.orgId);
			const levels = levelCount(method);
			const clean = normalizeBia(
				{
					v: 1,
					steps: d.steps,
					threshold: d.threshold,
					impacts: d.impacts,
					dataLossHours: d.dataLossHours ?? null,
					notes: d.notes ?? null,
				},
				method.dimensions,
				levels,
			);
			if (clean.steps.length < 2)
				return { result: { ok: false, error: "invalid" }, audit: [] };
			const bia: ProcessBia = {
				...clean,
				assessedAt: new Date().toISOString(),
				assessedBy: c.userId,
			};
			const s = suggestTargets(bia, method.dimensions);
			const targets: {
				mtpdHours?: number | null;
				rtoHours?: number | null;
				rpoHours?: number | null;
				criticality?: typeof s.criticality;
			} = d.adopt
				? {
						mtpdHours: s.mtpdHours,
						rtoHours: s.rtoHours,
						// ohne Angabe zum Datenverlust bleibt das bisherige RPO
						...(s.rpoHours !== null ? { rpoHours: s.rpoHours } : {}),
						...(d.adoptCriticality ? { criticality: s.criticality } : {}),
					}
				: {};
			await tx
				.update(processes)
				.set({ bia, ...targets })
				.where(eq(processes.id, before.id));
			// Neue Zielzeiten an einem aktiven Prozess sind eine Änderung wie
			// im Formular (Freigabe-Designer, Auslöser process.change)
			let approvalPending = false;
			if (d.adopt && before.status === "active") {
				const gate = await gateApproval(
					tx,
					{ orgId: c.orgId, userId: c.userId, name: c.name },
					{
						trigger: "process.change",
						entityType: "process",
						entityId: before.id,
						entityOwnerUserId: before.ownerUserId,
						title: `Prozess geändert: ${before.code} · ${before.name}`,
						link: `/prozesse/${before.code}`,
						facts: {
							criticality: targets.criticality ?? before.criticality,
						},
					},
				);
				if (gate.status === "error") throw new GateBlocked(gate.error);
				approvalPending = gate.status === "pending";
			}
			return {
				result: {
					ok: true,
					data: { code: before.code, adopted: d.adopt, approvalPending },
				},
				audit: {
					action: "process.bia_saved",
					target: `process:${before.id}`,
					before: {
						rtoHours: before.rtoHours,
						rpoHours: before.rpoHours,
						mtpdHours: before.mtpdHours,
						criticality: before.criticality,
					},
					after: {
						steps: bia.steps,
						threshold: bia.threshold,
						adopted: d.adopt,
						rtoHours: targets.rtoHours ?? before.rtoHours,
						rpoHours: targets.rpoHours ?? before.rpoHours,
						mtpdHours: targets.mtpdHours ?? before.mtpdHours,
						criticality: targets.criticality ?? before.criticality,
					},
				},
			};
		});
	} catch (e) {
		if (e instanceof GateBlocked) return { ok: false, error: e.code };
		throw e;
	}
	revalidatePath("/prozesse", "layout");
	revalidatePath("/testprogramm");
	return out;
}

export const saveProcessBia = safeAction("saveProcessBia", saveProcessBiaImpl);

// ── Notfallplan je Prozess (N3) ────────────────────────────────────────────

async function processOf(tx: OrgTx, orgId: string, processId: string) {
	const [p] = await tx
		.select({
			id: processes.id,
			code: processes.code,
			rtoHours: processes.rtoHours,
		})
		.from(processes)
		.where(
			and(eq(processes.id, processId), eq(processes.organizationId, orgId)),
		)
		.limit(1);
	return p ?? null;
}

// Plan speichern; ein freigegebener Plan gilt danach wieder als Entwurf, bis
// er erneut freigegeben ist (die Fassung zählt erst mit der Freigabe hoch)
async function saveBcmPlanImpl(
	input: unknown,
): Promise<ActionResult<{ code: string }>> {
	const c = await requireOrg({ process: ["update"] });
	const parsed = saveBcmPlanSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const content = normalizePlan(parsed.data.content);
	const res = await mutateOrg<ActionResult<{ code: string }>>(
		toOrgCtx(c),
		async (tx) => {
			const p = await processOf(tx, c.orgId, parsed.data.processId);
			if (!p) return { result: { ok: false, error: "notFound" }, audit: [] };
			const [before] = await tx
				.select({ id: bcmPlans.id, status: bcmPlans.status })
				.from(bcmPlans)
				.where(
					and(
						eq(bcmPlans.organizationId, c.orgId),
						eq(bcmPlans.processId, p.id),
					),
				)
				.limit(1);
			const now = new Date();
			let id = before?.id;
			if (before) {
				await tx
					.update(bcmPlans)
					.set({
						content,
						status: "draft",
						updatedBy: c.userId,
						updatedAt: now,
					})
					.where(eq(bcmPlans.id, before.id));
			} else {
				const [row] = await tx
					.insert(bcmPlans)
					.values({
						organizationId: c.orgId,
						processId: p.id,
						content,
						updatedBy: c.userId,
					})
					.returning({ id: bcmPlans.id });
				id = row?.id;
			}
			return {
				result: { ok: true, data: { code: p.code } },
				audit: {
					action: "bcm_plan.saved",
					target: `process:${p.id}`,
					before: before ? { status: before.status } : null,
					after: {
						planId: id ?? null,
						status: "draft",
						alert: content.alert.length,
						recovery: content.recovery.length,
						contacts: content.contacts.length,
					},
				},
			};
		},
	);
	revalidatePath("/prozesse", "layout");
	return res;
}

// Freigeben: nur ohne Lücken (Auslöser, Alarmierung, Wiederanlauf), Fassung
// hoch, Überprüfung in zwölf Monaten
async function releaseBcmPlanImpl(
	input: unknown,
): Promise<ActionResult<{ version: number }>> {
	const c = await requireOrg({ process: ["update"] });
	const parsed = releaseBcmPlanSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const res = await mutateOrg<ActionResult<{ version: number }>>(
		toOrgCtx(c),
		async (tx) => {
			const p = await processOf(tx, c.orgId, parsed.data.processId);
			if (!p) return { result: { ok: false, error: "notFound" }, audit: [] };
			const [plan] = await tx
				.select()
				.from(bcmPlans)
				.where(
					and(
						eq(bcmPlans.organizationId, c.orgId),
						eq(bcmPlans.processId, p.id),
					),
				)
				.limit(1);
			if (!plan) return { result: { ok: false, error: "notFound" }, audit: [] };
			const now = new Date();
			const issues = planIssues(plan.content, p, null, now.toISOString());
			if (!releasable(issues))
				return { result: { ok: false, error: "plan_incomplete" }, audit: [] };
			if (plan.status === "released")
				return {
					result: { ok: true, data: { version: plan.version } },
					audit: [],
				};
			const version = plan.version + 1;
			await tx
				.update(bcmPlans)
				.set({
					status: "released",
					version,
					releasedAt: now,
					releasedBy: c.userId,
					reviewAt: reviewDate(now),
					updatedAt: now,
				})
				.where(eq(bcmPlans.id, plan.id));
			return {
				result: { ok: true, data: { version } },
				audit: {
					action: "bcm_plan.released",
					target: `process:${p.id}`,
					before: { status: plan.status, version: plan.version },
					after: { status: "released", version, reviewAt: reviewDate(now) },
				},
			};
		},
	);
	revalidatePath("/prozesse", "layout");
	return res;
}

export const saveBcmPlan = safeAction("saveBcmPlan", saveBcmPlanImpl);
export const releaseBcmPlan = safeAction("releaseBcmPlan", releaseBcmPlanImpl);

// ── Notfallübungen (N4) ────────────────────────────────────────────────────

const EXERCISE_TITLE: Record<string, string> = {
	tabletop: "Planspiel",
	walkthrough: "Begehung",
	dry_run: "Trockenlauf",
	restore_test: "Wiederherstellungstest",
	failover: "Umschalttest",
	full: "Vollübung",
};

// Übung anlegen: Drehbuch aus dem Notfallplan des Prozesses (Alarmierung
// mit Funktionsschlüssel; die Namen löst die Seite auf)
async function createBcmExerciseImpl(
	input: unknown,
): Promise<ActionResult<{ id: string }>> {
	const c = await requireOrg({ control: ["update"] });
	const parsed = createBcmExerciseSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const res = await mutateOrg<ActionResult<{ id: string }>>(
		toOrgCtx(c),
		async (tx) => {
			let name = "";
			let planVersion: number | null = null;
			let script = seedScript(null, (r) => r);
			if (d.processId) {
				const [p] = await tx
					.select({
						id: processes.id,
						code: processes.code,
						name: processes.name,
					})
					.from(processes)
					.where(
						and(
							eq(processes.id, d.processId),
							eq(processes.organizationId, c.orgId),
						),
					)
					.limit(1);
				if (!p) return { result: { ok: false, error: "notFound" }, audit: [] };
				name = `${p.code} ${p.name}`;
				const [plan] = await tx
					.select({ content: bcmPlans.content, version: bcmPlans.version })
					.from(bcmPlans)
					.where(
						and(
							eq(bcmPlans.organizationId, c.orgId),
							eq(bcmPlans.processId, p.id),
						),
					)
					.limit(1);
				if (plan) {
					planVersion = plan.version || null;
					// Stellen der Alarmierung lesbar: Funktion übersetzt, Person mit Namen
					const tf = await getTranslations("Functions");
					const people = await userNames(
						tx,
						plan.content.alert
							.map((a) => a.who)
							.filter((w) => w && !w.startsWith("function:")),
					);
					script = seedScript(plan.content, (ref) => {
						if (!ref.startsWith("function:"))
							return people.get(ref) ?? "Unbekannt";
						const key = ref.slice("function:".length);
						if (key.startsWith("role:")) return "Eigene Rolle";
						return isFunctionKey(key)
							? tf(key as Parameters<typeof tf>[0])
							: key;
					});
				}
			}
			if (d.siteId) {
				const [site] = await tx
					.select({ id: sites.id, name: sites.name })
					.from(sites)
					.where(and(eq(sites.id, d.siteId), eq(sites.organizationId, c.orgId)))
					.limit(1);
				if (!site)
					return { result: { ok: false, error: "notFound" }, audit: [] };
				name ||= site.name;
			}
			const [row] = await tx
				.insert(bcmExercises)
				.values({
					organizationId: c.orgId,
					processId: d.processId ?? null,
					siteId: d.siteId ?? null,
					kind: d.kind,
					title: `${EXERCISE_TITLE[d.kind]}: ${name}`.slice(0, 200),
					plannedAt: d.plannedAt ?? null,
					script,
					participants: [],
					measures: [],
					planVersion,
					createdBy: c.userId,
				})
				.returning({ id: bcmExercises.id });
			if (!row) throw new Error("insert failed");
			return {
				result: { ok: true, data: { id: row.id } },
				audit: {
					action: "bcm_exercise.created",
					target: `bcm_exercise:${row.id}`,
					after: {
						kind: d.kind,
						processId: d.processId ?? null,
						siteId: d.siteId ?? null,
						plannedAt: d.plannedAt ?? null,
					},
				},
			};
		},
	);
	revalidatePath("/testprogramm", "layout");
	revalidatePath("/prozesse", "layout");
	return res;
}

async function saveBcmExerciseImpl(input: unknown): Promise<ActionResult> {
	const c = await requireOrg({ control: ["update"] });
	const parsed = saveBcmExerciseSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const clean = normalizeExercise(d);
	const res = await mutateOrg<ActionResult>(toOrgCtx(c), async (tx) => {
		const [ex] = await tx
			.select({ id: bcmExercises.id, status: bcmExercises.status })
			.from(bcmExercises)
			.where(
				and(
					eq(bcmExercises.id, d.id),
					eq(bcmExercises.organizationId, c.orgId),
				),
			)
			.limit(1);
		if (!ex) return { result: { ok: false, error: "notFound" }, audit: [] };
		// abgeschlossene Übungen sind fest (der Test steht im Testprogramm)
		if (ex.status === "done")
			return { result: { ok: false, error: "exercise_done" }, audit: [] };
		await tx
			.update(bcmExercises)
			.set({
				...clean,
				kind: d.kind,
				plannedAt: d.plannedAt,
				startedAt: d.startedAt,
				endedAt: d.endedAt,
				updatedAt: new Date(),
			})
			.where(eq(bcmExercises.id, ex.id));
		return {
			result: { ok: true, data: undefined },
			audit: {
				action: "bcm_exercise.saved",
				target: `bcm_exercise:${ex.id}`,
				after: {
					steps: clean.script.length,
					participants: clean.participants.length,
					recoveryMinutes: clean.recoveryMinutes,
					dataLossMinutes: clean.dataLossMinutes,
				},
			},
		};
	});
	revalidatePath("/testprogramm", "layout");
	return res;
}

// Abschließen: Ergebnis aus Messung und Drehbuch, Test im Testprogramm mit
// Prozess und Standort (schließt die Lücke; nicht bestanden öffnet eine
// Abweichung), Maßnahmen als Aufgaben am Prozess
async function completeBcmExerciseImpl(
	input: unknown,
): Promise<ActionResult<{ result: "pass" | "partial" | "fail" }>> {
	const c = await requireOrg({ control: ["update"] });
	const parsed = completeBcmExerciseSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const res = await mutateOrg<
		ActionResult<{ result: "pass" | "partial" | "fail" }>
	>(toOrgCtx(c), async (tx) => {
		const [ex] = await tx
			.select()
			.from(bcmExercises)
			.where(
				and(
					eq(bcmExercises.id, parsed.data.id),
					eq(bcmExercises.organizationId, c.orgId),
				),
			)
			.limit(1);
		if (!ex) return { result: { ok: false, error: "notFound" }, audit: [] };
		if (ex.status === "done")
			return { result: { ok: false, error: "exercise_done" }, audit: [] };
		const [p] = ex.processId
			? await tx
					.select({
						id: processes.id,
						code: processes.code,
						rtoHours: processes.rtoHours,
						rpoHours: processes.rpoHours,
					})
					.from(processes)
					.where(eq(processes.id, ex.processId))
					.limit(1)
			: [];
		const outcome = exerciseOutcome(
			ex.kind,
			{ rtoHours: p?.rtoHours ?? null, rpoHours: p?.rpoHours ?? null },
			{
				recoveryMinutes: ex.recoveryMinutes,
				dataLossMinutes: ex.dataLossMinutes,
			},
			ex.script,
		);
		const impl = await implementationFor(tx, c.orgId, exerciseControl(ex.kind));
		if (!impl) return { result: { ok: false, error: "notFound" }, audit: [] };
		const notes = [
			ex.title,
			ex.scenario && `Szenario: ${ex.scenario}`,
			ex.recoveryMinutes !== null &&
				`Wiederanlauf gemessen: ${formatMinutes(ex.recoveryMinutes)}${p?.rtoHours != null ? ` (RTO ${p.rtoHours} h)` : ""}`,
			ex.dataLossMinutes !== null &&
				`Datenverlust gemessen: ${formatMinutes(ex.dataLossMinutes)}${p?.rpoHours != null ? ` (RPO ${p.rpoHours} h)` : ""}`,
			ex.lessons && `Erkenntnisse: ${ex.lessons}`,
			`Übung: /testprogramm/uebungen/${ex.id}`,
		]
			.filter(Boolean)
			.join("\n");
		const test = await insertControlTest(
			tx,
			{ orgId: c.orgId, userId: c.userId },
			{
				implementationId: impl.id,
				method: "bcm_exercise",
				scope: ex.title,
				testedAt: ex.endedAt ?? new Date(),
				result: outcome.result,
				notes,
				processId: ex.processId,
				siteId: ex.siteId,
			},
		);
		for (const m of ex.measures)
			await tx.insert(tasks).values({
				organizationId: c.orgId,
				title: m.slice(0, 300),
				description: `Aus der Übung „${ex.title}“: /testprogramm/uebungen/${ex.id}`,
				assigneeUserId: c.userId,
				createdByUserId: c.userId,
				priority: outcome.result === "fail" ? "high" : "normal",
				entityType: p ? "process" : null,
				entityId: p?.id ?? null,
				sourceKind: "bcm_exercise",
			});
		await tx
			.update(bcmExercises)
			.set({
				status: "done",
				result: outcome.result,
				controlTestId: test.id,
				completedBy: c.userId,
				endedAt: ex.endedAt ?? new Date(),
				updatedAt: new Date(),
			})
			.where(eq(bcmExercises.id, ex.id));
		return {
			result: { ok: true, data: { result: outcome.result } },
			audit: [
				...test.audits,
				{
					action: "bcm_exercise.completed",
					target: `bcm_exercise:${ex.id}`,
					after: {
						result: outcome.result,
						rtoMet: outcome.rtoMet,
						rpoMet: outcome.rpoMet,
						measures: ex.measures.length,
						controlTestId: test.id,
					},
				},
			],
		};
	});
	revalidatePath("/testprogramm", "layout");
	revalidatePath("/prozesse", "layout");
	revalidatePath("/controls", "layout");
	return res;
}

export const createBcmExercise = safeAction(
	"createBcmExercise",
	createBcmExerciseImpl,
);
export const saveBcmExercise = safeAction(
	"saveBcmExercise",
	saveBcmExerciseImpl,
);
export const completeBcmExercise = safeAction(
	"completeBcmExercise",
	completeBcmExerciseImpl,
);
