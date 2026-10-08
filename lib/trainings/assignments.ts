import { and, eq, inArray } from "drizzle-orm";
import { member } from "@/db/auth-schema";
import {
	roleAssignments,
	trainingAssignments,
	trainingRequirements,
} from "@/db/schema";
import { normalizeRole } from "@/lib/auth/session-rules";
import type { OrgTx } from "@/lib/db/with-org";

function addDays(base: Date, days: number): string {
	return new Date(base.getTime() + days * 86_400_000)
		.toISOString()
		.slice(0, 10);
}

export function addMonthsIso(base: Date, months: number): string {
	const d = new Date(base);
	d.setMonth(d.getMonth() + months);
	return d.toISOString().slice(0, 10);
}

// „Fällig“ heißt: innerhalb der nächsten 30 Tage. Später liegende Termine
// (z. B. der Folgezyklus nach einem Abschluss) sind „geplant“.
export const DUE_SOON_DAYS = 30;
export type TrainingState = "done" | "overdue" | "due" | "planned";

export function trainingState(
	a: { status: string; dueAt: string },
	today: string,
): TrainingState {
	if (a.status === "done") return "done";
	if (a.dueAt < today) return "overdue";
	return a.dueAt <= addDays(new Date(`${today}T00:00:00Z`), DUE_SOON_DAYS)
		? "due"
		: "planned";
}

// Pflichtschulung für Personen erledigt: offene Zuweisungen schließen und den
// Folgezyklus (Abschluss + Turnus) anlegen. Genutzt von „Schulung erfassen“
// (Teilnehmerliste) und „Abgeschlossen“ (Selbstbestätigung).
export async function completeAssignments(
	tx: OrgTx,
	orgId: string,
	req: { id: string; frequencyMonths: number },
	userIds: readonly string[],
	completedAt: string,
	extra: {
		trainingId?: string | null;
		evidenceId?: string | null;
		note?: string | null;
	} = {},
): Promise<number> {
	if (userIds.length === 0) return 0;
	const open = await tx
		.select({ id: trainingAssignments.id })
		.from(trainingAssignments)
		.where(
			and(
				eq(trainingAssignments.organizationId, orgId),
				eq(trainingAssignments.requirementId, req.id),
				inArray(trainingAssignments.userId, [...userIds]),
				inArray(trainingAssignments.status, ["due", "overdue"]),
			),
		);
	if (open.length > 0) {
		await tx
			.update(trainingAssignments)
			.set({
				status: "done",
				completedAt,
				trainingId: extra.trainingId ?? null,
				evidenceId: extra.evidenceId ?? null,
				note: extra.note ?? null,
			})
			.where(
				inArray(
					trainingAssignments.id,
					open.map((o) => o.id),
				),
			);
	}
	await tx.insert(trainingAssignments).values(
		userIds.map((userId) => ({
			organizationId: orgId,
			requirementId: req.id,
			userId,
			dueAt: addMonthsIso(new Date(completedAt), req.frequencyMonths),
			status: "due" as const,
		})),
	);
	return open.length;
}

// Zuweisungen: je Mitglied und passender Pflichtschulung (Rolle/Funktion)
// eine offene Zuweisung, falls keine existiert.
export async function syncTrainingAssignments(
	tx: OrgTx,
	orgId: string,
): Promise<number> {
	const reqs = await tx
		.select()
		.from(trainingRequirements)
		.where(eq(trainingRequirements.organizationId, orgId));
	if (reqs.length === 0) return 0;
	const members = await tx
		.select({ userId: member.userId, role: member.role })
		.from(member)
		.where(eq(member.organizationId, orgId));
	const fns = await tx
		.select({
			function: roleAssignments.function,
			userId: roleAssignments.userId,
		})
		.from(roleAssignments)
		.where(eq(roleAssignments.organizationId, orgId));
	const existing = await tx
		.select({
			requirementId: trainingAssignments.requirementId,
			userId: trainingAssignments.userId,
		})
		.from(trainingAssignments)
		.where(eq(trainingAssignments.organizationId, orgId));
	const have = new Set(existing.map((e) => `${e.requirementId}|${e.userId}`));
	let n = 0;
	const due = addDays(new Date(), 30);
	for (const r of reqs) {
		for (const m of members) {
			const role = normalizeRole(m.role);
			const matchesRole =
				r.orgRole === "all" ||
				r.orgRole === role ||
				(r.orgRole === "editor" && role === "owner");
			const matchesFn = r.function
				? fns.some((f) => f.function === r.function && f.userId === m.userId)
				: false;
			if (!(matchesRole || matchesFn)) continue;
			if (have.has(`${r.id}|${m.userId}`)) continue;
			await tx.insert(trainingAssignments).values({
				organizationId: orgId,
				requirementId: r.id,
				userId: m.userId,
				dueAt: due,
				status: "due",
			});
			n += 1;
		}
	}
	return n;
}

export type AssignmentLike = {
	id: string;
	requirementId: string;
	userId: string;
	status: string;
	dueAt: string;
	completedAt: string | null;
};

export type CurrentTraining<A extends AssignmentLike> = {
	state: TrainingState;
	open: A | null;
	lastDoneAt: string | null;
};

// Aktueller Stand je Person und Pflichtschulung: die offene Zuweisung zählt;
// liegt sie nach einem Abschluss noch weit in der Zukunft („geplant“), gilt
// die Schulung als erfüllt.
export function currentTrainings<A extends AssignmentLike>(
	assignments: readonly A[],
	today: string,
): Map<string, CurrentTraining<A>> {
	const groups = new Map<string, A[]>();
	for (const a of assignments) {
		const k = `${a.requirementId}|${a.userId}`;
		const list = groups.get(k) ?? [];
		list.push(a);
		groups.set(k, list);
	}
	const out = new Map<string, CurrentTraining<A>>();
	for (const [k, list] of groups) {
		const open =
			list
				.filter((a) => a.status !== "done")
				.sort((x, y) => x.dueAt.localeCompare(y.dueAt))[0] ?? null;
		const lastDoneAt =
			list
				.filter((a) => a.status === "done" && a.completedAt)
				.map((a) => a.completedAt as string)
				.sort()
				.at(-1) ?? null;
		let state: TrainingState = open ? trainingState(open, today) : "done";
		if (state === "planned" && lastDoneAt) state = "done";
		if (!open && !lastDoneAt) continue;
		out.set(k, { state, open, lastDoneAt });
	}
	return out;
}
