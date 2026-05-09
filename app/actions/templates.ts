"use server";

import { and, asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/db";
import {
	employers,
	hiringProcessTemplates,
	jobStages,
	jobs,
	type StageKind,
	type TemplateStage,
	templateStages,
} from "@/db/schema";

async function requireEmployer(): Promise<{
	employerId: string;
	userId: string;
}> {
	const session = await auth();
	if (!session?.user?.id) throw new Error("unauthenticated");
	const [emp] = await db
		.select()
		.from(employers)
		.where(eq(employers.userId, session.user.id))
		.limit(1);
	if (!emp) throw new Error("no employer");
	return { employerId: emp.id, userId: session.user.id };
}

// Default-Stage-Sets pro Branche/Funktion. Knapp gehalten — Arbeitgeber
// passen das in der UI an. Das Template ist ein Vorschlag, kein Korsett.
type DefaultStage = {
	kind: StageKind;
	name: string;
	description?: string;
	expectedDays: number;
	responsibleRole: "recruiter" | "hiring_manager" | "team" | "system";
	required: boolean;
};

const DEFAULT_STAGES: DefaultStage[] = [
	{
		kind: "application_received",
		name: "Bewerbung eingegangen",
		description: "Eingang bestätigt, Snapshot eingefroren.",
		expectedDays: 1,
		responsibleRole: "system",
		required: true,
	},
	{
		kind: "recruiter_review",
		name: "Recruiter-Sichtung",
		description: "Erste Prüfung der Unterlagen gegen die Anforderungen.",
		expectedDays: 5,
		responsibleRole: "recruiter",
		required: true,
	},
	{
		kind: "hiring_manager_review",
		name: "Fachbereich",
		description: "Hiring Manager bewertet Profil + Cover-Letter.",
		expectedDays: 7,
		responsibleRole: "hiring_manager",
		required: true,
	},
	{
		kind: "phone_screen",
		name: "Telefoninterview",
		description: "30-Min-Call zum Kennenlernen + Erwartungs-Abgleich.",
		expectedDays: 7,
		responsibleRole: "recruiter",
		required: false,
	},
	{
		kind: "interview",
		name: "Interview",
		description: "Vor-Ort- oder Video-Interview mit dem Team.",
		expectedDays: 10,
		responsibleRole: "team",
		required: true,
	},
	{
		kind: "offer_preparation",
		name: "Angebot vorbereiten",
		description: "Konditionen abstimmen, Vertrag entwerfen.",
		expectedDays: 5,
		responsibleRole: "recruiter",
		required: true,
	},
	{
		kind: "final_decision",
		name: "Endentscheidung",
		description: "Angebot platziert oder begründete Absage.",
		expectedDays: 3,
		responsibleRole: "hiring_manager",
		required: true,
	},
];

// Erstellt für einen Arbeitgeber das Standard-Template falls noch keins
// existiert. Idempotent. Wird beim ersten Job-Save aufgerufen.
export async function ensureDefaultTemplate(
	employerId: string,
): Promise<string> {
	const [existing] = await db
		.select({ id: hiringProcessTemplates.id })
		.from(hiringProcessTemplates)
		.where(
			and(
				eq(hiringProcessTemplates.employerId, employerId),
				eq(hiringProcessTemplates.isDefault, true),
			),
		)
		.limit(1);
	if (existing) return existing.id;

	const [created] = await db
		.insert(hiringProcessTemplates)
		.values({
			employerId,
			name: "Standard-Prozess",
			description: "Sieben Stages vom Eingang bis zur Endentscheidung.",
			isDefault: true,
		})
		.returning({ id: hiringProcessTemplates.id });

	await db.insert(templateStages).values(
		DEFAULT_STAGES.map((s, i) => ({
			templateId: created.id,
			position: i,
			kind: s.kind,
			name: s.name,
			description: s.description,
			expectedDays: s.expectedDays,
			responsibleRole: s.responsibleRole,
			required: s.required,
		})),
	);

	return created.id;
}

export type TemplateWithStages = {
	template: typeof hiringProcessTemplates.$inferSelect;
	stages: TemplateStage[];
};

export async function listTemplates(): Promise<TemplateWithStages[]> {
	const { employerId } = await requireEmployer();
	const templates = await db
		.select()
		.from(hiringProcessTemplates)
		.where(eq(hiringProcessTemplates.employerId, employerId))
		.orderBy(asc(hiringProcessTemplates.createdAt));
	if (templates.length === 0) {
		await ensureDefaultTemplate(employerId);
		return listTemplates();
	}
	const ids = templates.map((t) => t.id);
	const stagesAll = ids.length
		? await db
				.select()
				.from(templateStages)
				.where(
					sql`${templateStages.templateId} IN (${sql.join(
						ids.map((i) => sql`${i}`),
						sql`, `,
					)})`,
				)
				.orderBy(asc(templateStages.position))
		: [];
	return templates.map((t) => ({
		template: t,
		stages: stagesAll.filter((s) => s.templateId === t.id),
	}));
}

export async function getTemplate(
	templateId: string,
): Promise<TemplateWithStages | null> {
	const { employerId } = await requireEmployer();
	const [t] = await db
		.select()
		.from(hiringProcessTemplates)
		.where(
			and(
				eq(hiringProcessTemplates.id, templateId),
				eq(hiringProcessTemplates.employerId, employerId),
			),
		)
		.limit(1);
	if (!t) return null;
	const stages = await db
		.select()
		.from(templateStages)
		.where(eq(templateStages.templateId, templateId))
		.orderBy(asc(templateStages.position));
	return { template: t, stages };
}

export type SaveTemplateInput = {
	id?: string;
	name: string;
	description?: string;
	isDefault?: boolean;
	stages: Array<{
		kind: StageKind;
		name: string;
		description?: string | null;
		expectedDays?: number | null;
		responsibleRole?: "recruiter" | "hiring_manager" | "team" | "system";
		required?: boolean;
		materials?: string | null;
	}>;
};

export async function saveTemplate(
	input: SaveTemplateInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
	try {
		const { employerId } = await requireEmployer();
		if (!input.name.trim()) {
			return {
				ok: false,
				error: "Bitte einen Namen für das Template angeben.",
			};
		}
		if (input.stages.length === 0) {
			return { ok: false, error: "Mindestens eine Stage erforderlich." };
		}

		// Wenn isDefault gesetzt: alte Defaults dieses Employers entfernen.
		if (input.isDefault) {
			await db
				.update(hiringProcessTemplates)
				.set({ isDefault: false })
				.where(eq(hiringProcessTemplates.employerId, employerId));
		}

		let id = input.id;
		if (id) {
			const [own] = await db
				.select({ id: hiringProcessTemplates.id })
				.from(hiringProcessTemplates)
				.where(
					and(
						eq(hiringProcessTemplates.id, id),
						eq(hiringProcessTemplates.employerId, employerId),
					),
				)
				.limit(1);
			if (!own) return { ok: false, error: "Template nicht gefunden." };
			await db
				.update(hiringProcessTemplates)
				.set({
					name: input.name.trim(),
					description: input.description?.trim() || null,
					isDefault: input.isDefault ?? false,
					updatedAt: new Date(),
				})
				.where(eq(hiringProcessTemplates.id, id));
			await db.delete(templateStages).where(eq(templateStages.templateId, id));
		} else {
			const [created] = await db
				.insert(hiringProcessTemplates)
				.values({
					employerId,
					name: input.name.trim(),
					description: input.description?.trim() || null,
					isDefault: input.isDefault ?? false,
				})
				.returning({ id: hiringProcessTemplates.id });
			id = created.id;
		}

		await db.insert(templateStages).values(
			input.stages.map((s, i) => ({
				templateId: id ?? "",
				position: i,
				kind: s.kind,
				name: s.name.trim(),
				description: s.description?.trim() || null,
				expectedDays: s.expectedDays ?? null,
				responsibleRole: s.responsibleRole ?? "recruiter",
				required: s.required ?? true,
				materials: s.materials?.trim() || null,
			})),
		);

		revalidatePath("/templates");
		return { ok: true, id };
	} catch (e) {
		console.error("[templates] save", e);
		return {
			ok: false,
			error: e instanceof Error ? e.message : "fehlgeschlagen",
		};
	}
}

export async function deleteTemplate(
	templateId: string,
): Promise<{ ok: boolean; error?: string }> {
	try {
		const { employerId } = await requireEmployer();
		await db
			.delete(hiringProcessTemplates)
			.where(
				and(
					eq(hiringProcessTemplates.id, templateId),
					eq(hiringProcessTemplates.employerId, employerId),
				),
			);
		revalidatePath("/templates");
		return { ok: true };
	} catch (e) {
		return {
			ok: false,
			error: e instanceof Error ? e.message : "fehlgeschlagen",
		};
	}
}

// Kopiert ein Template als unveränderlichen Snapshot in `job_stages`.
// Wird beim erstmaligen Veröffentlichen einer Stelle aufgerufen.
export async function instantiateJobStages(
	jobId: string,
	templateId: string,
): Promise<void> {
	const stages = await db
		.select()
		.from(templateStages)
		.where(eq(templateStages.templateId, templateId))
		.orderBy(asc(templateStages.position));
	if (stages.length === 0) return;

	// Idempotent: Wenn schon Stages existieren, nichts überschreiben.
	const [existing] = await db
		.select({ id: jobStages.id })
		.from(jobStages)
		.where(eq(jobStages.jobId, jobId))
		.limit(1);
	if (existing) return;

	await db.insert(jobStages).values(
		stages.map((s) => ({
			jobId,
			position: s.position,
			kind: s.kind,
			name: s.name,
			description: s.description,
			expectedDays: s.expectedDays,
			responsibleRole: s.responsibleRole,
			required: s.required,
			materials: s.materials,
		})),
	);
}

export async function listJobStages(jobId: string) {
	return db
		.select()
		.from(jobStages)
		.where(eq(jobStages.jobId, jobId))
		.orderBy(asc(jobStages.position));
}

// Hilfsfunktion: ist eine Stelle "publishable"? Für die Volumen-Lock-Logik.
// Wenn ein Arbeitgeber 5+ überfällige Closures hat, blockieren wir neue
// Veröffentlichungen bis er räumt.
export async function checkVolumeLock(employerId: string): Promise<{
	blocked: boolean;
	criticalCount: number;
	overdueClosureCount: number;
}> {
	const now = new Date();
	const rows = await db.execute<{
		critical_count: number;
		overdue_count: number;
	}>(sql`
		SELECT
			COUNT(*) FILTER (
				WHERE a.status NOT IN ('declined', 'withdrawn', 'archived', 'offer')
				AND a.stage_entered_at IS NOT NULL
				AND js.expected_days IS NOT NULL
				AND a.stage_entered_at + (js.expected_days * 2 * INTERVAL '1 day') < ${now}
			)::int AS critical_count,
			COUNT(*) FILTER (
				WHERE a.status NOT IN ('declined', 'withdrawn', 'archived', 'offer')
				AND a.closure_deadline_at IS NOT NULL
				AND a.closure_deadline_at < ${now}
			)::int AS overdue_count
		FROM applications a
		LEFT JOIN job_stages js ON js.id = a.current_stage_id
		WHERE a.employer_id = ${employerId}
	`);
	const r = (
		rows as unknown as {
			rows?: { critical_count: number; overdue_count: number }[];
		}
	).rows?.[0] ?? { critical_count: 0, overdue_count: 0 };
	const criticalCount = Number(r.critical_count ?? 0);
	const overdueClosureCount = Number(r.overdue_count ?? 0);
	const blocked = overdueClosureCount >= 5;
	return { blocked, criticalCount, overdueClosureCount };
}

// Setzt für eine Stelle das Template, falls noch keins gesetzt ist.
// Wird vom Job-Save-Path benutzt.
export async function setJobTemplate(
	jobId: string,
	templateId: string | null,
): Promise<void> {
	await db.update(jobs).set({ templateId }).where(eq(jobs.id, jobId));
}
