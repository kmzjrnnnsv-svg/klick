import { and, asc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import {
	controlImplementations,
	controls,
	controlTests,
	frameworks,
	postureSnapshots,
} from "@/db/schema";
import type { OrgTx } from "@/lib/db/with-org";
import type { PersonLoad } from "./report";

// Auswertung (/auswertung): Zahlen in SQL über Indizes mit Organisation
// vorn. Die Antworten wachsen mit Zeitraum, Rahmenwerken, Personen und
// Bereichen, nie mit der Zahl der Aufgaben oder Tests.

/**
 * Abdeckung über die Zeit: Durchschnitt der gewählten Rahmenwerke je Tag,
 * ab 90 Tagen je Woche. Dazu je Rahmenwerk der erste und der letzte Wert im
 * Zeitraum.
 */
export async function postureReport(
	tx: OrgTx,
	orgId: string,
	opts: { from: string; slugs: readonly string[]; weekly: boolean },
) {
	if (opts.slugs.length === 0) return { series: [], byFramework: [] };
	const bucket = opts.weekly
		? sql<string>`(date_trunc('week', ${postureSnapshots.date}))::date::text`
		: sql<string>`${postureSnapshots.date}::text`;
	const where = and(
		eq(postureSnapshots.organizationId, orgId),
		gte(postureSnapshots.date, opts.from),
		inArray(frameworks.slug, [...opts.slugs]),
		isNotNull(postureSnapshots.coveragePct),
	);
	const [series, byFramework] = await Promise.all([
		tx
			.select({
				date: bucket,
				value: sql<number>`avg(${postureSnapshots.coveragePct})::float`,
			})
			.from(postureSnapshots)
			.innerJoin(frameworks, eq(frameworks.id, postureSnapshots.frameworkId))
			.where(where)
			.groupBy(bucket)
			.orderBy(asc(bucket)),
		tx
			.select({
				slug: frameworks.slug,
				first: sql<number>`(array_agg(${postureSnapshots.coveragePct} order by ${postureSnapshots.date} asc))[1]::float`,
				last: sql<number>`(array_agg(${postureSnapshots.coveragePct} order by ${postureSnapshots.date} desc))[1]::float`,
			})
			.from(postureSnapshots)
			.innerJoin(frameworks, eq(frameworks.id, postureSnapshots.frameworkId))
			.where(where)
			.groupBy(frameworks.slug),
	]);
	return { series, byFramework };
}

/**
 * Offene Punkte je Person: offene Aufgaben (Bearbeitet von), Überprüfungen
 * der Controls (Verantwortlich) und offene Schulungen. Überfällig = Frist
 * vor heute, bald = bis `soon`, im Plan = später, ohne Frist = nur Aufgaben.
 */
export async function openItemsByPerson(
	tx: OrgTx,
	orgId: string,
	today: string,
	soon: string,
): Promise<PersonLoad[]> {
	const rows = await tx.execute<{
		user_id: string;
		overdue: number;
		soon: number;
		planned: number;
		undated: number;
	}>(sql`
		with items as (
		  select assignee_user_id as user_id, due_at from tasks
		  where organization_id = ${orgId} and assignee_user_id is not null
		    and status in ('todo', 'doing', 'blocked')
		  union all
		  select owner_user_id, next_review_at from control_implementations
		  where organization_id = ${orgId} and owner_user_id is not null
		    and next_review_at is not null and status <> 'not_applicable'
		  union all
		  select user_id, due_at from training_assignments
		  where organization_id = ${orgId} and status <> 'done'
		)
		select user_id::text as user_id,
		  count(*) filter (where due_at < ${today}::date)::int as overdue,
		  count(*) filter (where due_at >= ${today}::date and due_at <= ${soon}::date)::int as soon,
		  count(*) filter (where due_at > ${soon}::date)::int as planned,
		  count(*) filter (where due_at is null)::int as undated
		from items group by user_id`);
	return rows.map((r) => ({
		userId: r.user_id,
		overdue: r.overdue,
		soon: r.soon,
		planned: r.planned,
		undated: r.undated,
	}));
}

/** Tests seit `since` je Bereich der Controls, optional nur bestimmte Controls */
export async function testsByDomain(
	tx: OrgTx,
	orgId: string,
	since: string,
	onlyControls?: readonly string[],
) {
	if (onlyControls && onlyControls.length === 0) return [];
	return tx
		.select({
			domain: controls.domain,
			pass: sql<number>`count(*) filter (where ${controlTests.result} = 'pass')::int`,
			partial: sql<number>`count(*) filter (where ${controlTests.result} = 'partial')::int`,
			fail: sql<number>`count(*) filter (where ${controlTests.result} = 'fail')::int`,
		})
		.from(controlTests)
		.innerJoin(
			controlImplementations,
			eq(controlImplementations.id, controlTests.implementationId),
		)
		.innerJoin(controls, eq(controls.id, controlImplementations.controlId))
		.where(
			and(
				eq(controlTests.organizationId, orgId),
				isNotNull(controlTests.result),
				sql`${controlTests.testedAt} >= ${since}::date`,
				onlyControls ? inArray(controls.code, [...onlyControls]) : undefined,
			),
		)
		.groupBy(controls.domain);
}
