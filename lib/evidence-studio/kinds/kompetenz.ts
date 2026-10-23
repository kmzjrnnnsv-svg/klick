import { and, asc, eq } from "drizzle-orm";
import {
	trainingAssignments,
	trainingRequirements,
	trainings,
} from "@/db/schema";
import { userNames } from "@/lib/compliance/queries";
import type { DocBlock } from "@/lib/export/doc-model";
import { fmtDay, functionLabel } from "../generate/doc";
import { generator } from "../generate/types";

// NW-KOMPETENZ: Pflichtschulungen mit Teilnahmequote, Personen mit offenen
// Schulungen und durchgeführte Schulungen (ISO 27001 7.2, 7.3)
export type KompetenzFacts = {
	requirements: {
		code: string;
		title: string;
		audience: string | null;
		frequencyMonths: number;
		legalBasis: string | null;
		assignments: { person: string; dueAt: string; done: boolean }[];
	}[];
	trainings: {
		title: string;
		heldAt: string;
		trainer: string | null;
		audience: string;
		attendees: number;
	}[];
};

const AUDIENCE_DE: Record<string, string> = {
	all: "alle",
	management: "Leitung",
	role_specific: "rollenbezogen",
};

const pct = (n: number, d: number) =>
	d === 0 ? "—" : `${Math.round((n / d) * 100)} %`;

export function buildKompetenz(f: KompetenzFacts, ctx: { today: string }) {
	const all = f.requirements.flatMap((r) => r.assignments);
	const done = all.filter((a) => a.done).length;
	const overdue = (a: { dueAt: string; done: boolean }) =>
		!a.done && a.dueAt < ctx.today;
	const byPerson = new Map<string, { open: number; overdue: number }>();
	for (const a of all) {
		if (a.done) continue;
		const p = byPerson.get(a.person) ?? { open: 0, overdue: 0 };
		p.open += 1;
		if (overdue(a)) p.overdue += 1;
		byPerson.set(a.person, p);
	}
	const blocks: DocBlock[] = [
		{
			type: "keyValue",
			items: [
				["Pflichtschulungen", String(f.requirements.length)],
				["Zuweisungen", String(all.length)],
				["abgeschlossen", `${done} (${pct(done, all.length)})`],
				["überfällig", String(all.filter(overdue).length)],
				["durchgeführte Schulungen", String(f.trainings.length)],
			],
		},
		{ type: "heading", level: 1, text: "Pflichtschulungen" },
		{
			type: "table",
			columns: [
				{ label: "Schulung", width: 28 },
				{ label: "Zielgruppe", width: 16 },
				{ label: "Turnus", width: 10 },
				{ label: "Teilnahme", width: 14 },
				{ label: "überfällig", width: 9 },
				{ label: "Grundlage", width: 18 },
			],
			rows: f.requirements.map((r) => {
				const d = r.assignments.filter((a) => a.done).length;
				return [
					`${r.code} ${r.title}`,
					r.audience ?? "alle",
					`${r.frequencyMonths} Monate`,
					`${d} von ${r.assignments.length} (${pct(d, r.assignments.length)})`,
					String(r.assignments.filter(overdue).length),
					r.legalBasis ?? "",
				];
			}),
			empty: "Keine Pflichtschulungen festgelegt.",
		},
	];
	if (byPerson.size > 0)
		blocks.push(
			{ type: "heading", level: 1, text: "Offene Schulungen je Person" },
			{
				type: "table",
				columns: [
					{ label: "Person", width: 50 },
					{ label: "offen", width: 15 },
					{ label: "davon überfällig", width: 20 },
				],
				rows: [...byPerson]
					.sort(
						(a, b) => b[1].overdue - a[1].overdue || a[0].localeCompare(b[0]),
					)
					.map(([person, p]) => [person, String(p.open), String(p.overdue)]),
			},
		);
	blocks.push(
		{ type: "heading", level: 1, text: "Durchgeführte Schulungen" },
		{
			type: "table",
			columns: [
				{ label: "Datum", width: 12 },
				{ label: "Schulung", width: 36 },
				{ label: "Durchgeführt von", width: 20 },
				{ label: "Zielgruppe", width: 12 },
				{ label: "Teilnehmende", width: 12 },
			],
			rows: f.trainings.map((t) => [
				fmtDay(t.heldAt),
				t.title,
				t.trainer ?? "",
				AUDIENCE_DE[t.audience] ?? t.audience,
				String(t.attendees),
			]),
			empty: "Noch keine Schulungen erfasst.",
		},
	);
	return { blocks };
}

export const kompetenz = generator<KompetenzFacts>({
	code: "NW-KOMPETENZ",
	async load(tx, orgId) {
		const [reqs, assigns, held] = await Promise.all([
			tx
				.select()
				.from(trainingRequirements)
				.where(
					and(
						eq(trainingRequirements.organizationId, orgId),
						eq(trainingRequirements.approvalStatus, "approved"),
					),
				)
				.orderBy(asc(trainingRequirements.code)),
			tx
				.select({
					requirementId: trainingAssignments.requirementId,
					userId: trainingAssignments.userId,
					dueAt: trainingAssignments.dueAt,
					completedAt: trainingAssignments.completedAt,
					status: trainingAssignments.status,
				})
				.from(trainingAssignments)
				.where(eq(trainingAssignments.organizationId, orgId)),
			tx
				.select()
				.from(trainings)
				.where(eq(trainings.organizationId, orgId))
				.orderBy(asc(trainings.heldAt)),
		]);
		const names = await userNames(tx, [
			...assigns.map((a) => a.userId),
			...held.map((t) => t.trainerUserId),
		]);
		return {
			requirements: reqs.map((r) => ({
				code: r.code,
				title: r.title,
				audience: r.function
					? functionLabel(r.function)
					: r.orgRole
						? `Rolle ${r.orgRole}`
						: null,
				frequencyMonths: r.frequencyMonths,
				legalBasis: r.legalBasis,
				assignments: assigns
					.filter((a) => a.requirementId === r.id)
					.map((a) => ({
						person: names.get(a.userId) ?? "unbekannt",
						dueAt: a.dueAt,
						// erledigt zählt; „fällig/überfällig“ stellt der Tick um und
						// gehört nicht in den Schnappschuss
						done: a.status === "done" || a.completedAt !== null,
					}))
					.sort((a, b) => a.person.localeCompare(b.person)),
			})),
			trainings: held.map((t) => ({
				title: t.title,
				heldAt: t.heldAt,
				trainer: t.trainerUserId
					? (names.get(t.trainerUserId) ?? null)
					: t.externalTrainer,
				audience: t.audience,
				attendees: (t.attendeeUserIds ?? []).length,
			})),
		};
	},
	build: buildKompetenz,
});
