import { getTableName, sql } from "drizzle-orm";
import {
	amlMonitoringRules,
	amlRiskAnalyses,
	assessments,
	assets,
	audits,
	communications,
	complaints,
	conflictsOfInterest,
	contextIssues,
	controlImplementations,
	dataSubjectRequests,
	documents,
	evidence,
	exceptions,
	incidents,
	insurancePolicies,
	interestedParties,
	lossEvents,
	managementReviews,
	milestones,
	nonconformities,
	objectives,
	obligations,
	orgFrameworks,
	processes,
	processingActivities,
	products,
	providers,
	regulatorInteractions,
	risks,
	riskTreatments,
	scopes,
	securityEngagements,
	securityFindings,
	sites,
	suspiciousReports,
	wallets,
} from "@/db/schema";
import { type FunctionKey, ROLE_FUNCTIONS } from "@/db/schema/enums";
import { responsibleFor } from "@/lib/compliance/function-holders";
import { loadAssignments } from "@/lib/compliance/function-holders-service";
import type { OrgTx } from "@/lib/db/with-org";
import { notify } from "@/lib/notifications/notify";

// „Verantwortlich“ = Funktion oder Person (Teil A). Ist owner_function
// gesetzt, ist owner_user_id die aufgelöste Person — so funktionieren
// Erinnerungen, Exporte, „Meine Verantwortung“ und die Freigabe-Regel
// „Verantwortliche:r“ unverändert. Alle Tabellen mit Verantwortlichen stehen
// hier; Test function-owners hält die Liste vollständig.
export const OWNER_FUNCTION_TABLES = [
	amlMonitoringRules,
	amlRiskAnalyses,
	assessments,
	assets,
	audits,
	communications,
	complaints,
	conflictsOfInterest,
	contextIssues,
	controlImplementations,
	dataSubjectRequests,
	documents,
	evidence,
	exceptions,
	incidents,
	insurancePolicies,
	interestedParties,
	lossEvents,
	managementReviews,
	milestones,
	nonconformities,
	objectives,
	obligations,
	orgFrameworks,
	processes,
	processingActivities,
	products,
	providers,
	regulatorInteractions,
	riskTreatments,
	risks,
	scopes,
	securityEngagements,
	securityFindings,
	sites,
	suspiciousReports,
	wallets,
] as const;

// Person je Funktion neu rechnen — nach jeder Änderung an role_assignments
// und täglich im Tick (idempotent). Unbesetzte Funktion: die bisherige
// Person bleibt stehen. Liefert je Person die Zahl der Einträge, für die
// sie neu verantwortlich ist (für die Benachrichtigung).
export async function syncFunctionOwners(
	tx: OrgTx,
	orgId: string,
): Promise<Map<string, number>> {
	const rows = await loadAssignments(tx, orgId);
	// Katalog-Funktionen und eigene Rollen (`role:<id>`), die jemand hält
	const keys = [
		...new Set<FunctionKey>([
			...ROLE_FUNCTIONS,
			...rows.map((r) => r.function),
		]),
	];
	const pairs = keys.flatMap((fn) => {
		const u = responsibleFor(rows, fn);
		return u ? [{ fn, u }] : [];
	});
	const gained = new Map<string, number>();
	if (pairs.length === 0) return gained;
	const values = sql.join(
		pairs.map(({ fn, u }) => sql`(${fn}, ${u}::uuid)`),
		sql`, `,
	);
	for (const table of OWNER_FUNCTION_TABLES) {
		const res = await tx.execute<{ owner_user_id: string }>(sql`
			update ${sql.identifier(getTableName(table))} as t
			set owner_user_id = m.user_id
			from (values ${values}) as m(fn, user_id)
			where t.organization_id = ${orgId}
				and t.owner_function = m.fn
				and t.owner_user_id is distinct from m.user_id
			returning t.owner_user_id`);
		for (const r of res)
			gained.set(r.owner_user_id, (gained.get(r.owner_user_id) ?? 0) + 1);
	}
	return gained;
}

// Einträge, die eine Funktion (z. B. eigene Rolle `role:<id>`) als
// Verantwortlich tragen — je Tabelle die Anzahl (Löschen einer Rolle)
export async function ownerRefsOf(
	tx: OrgTx,
	orgId: string,
	key: FunctionKey,
): Promise<number> {
	let total = 0;
	for (const table of OWNER_FUNCTION_TABLES) {
		const [r] = await tx.execute<{ n: number }>(sql`
			select count(*)::int as n from ${sql.identifier(getTableName(table))}
			where organization_id = ${orgId} and owner_function = ${key}`);
		total += r?.n ?? 0;
	}
	return total;
}

// Nach jeder Änderung an role_assignments: Personen neu rechnen und wer neu
// verantwortlich ist, erfährt es (nie die handelnde Person selbst).
export async function syncOwnersAndNotify(
	tx: OrgTx,
	orgId: string,
	actorUserId: string | null,
): Promise<void> {
	const gained = await syncFunctionOwners(tx, orgId);
	for (const [userId, count] of gained)
		await notify(tx, {
			orgId,
			recipients: [userId],
			actorUserId,
			kind: "task_assigned",
			title:
				count === 1
					? "Du bist jetzt für einen Eintrag verantwortlich"
					: `Du bist jetzt für ${count} Einträge verantwortlich`,
			body: "Über deine Funktion zugeordnet.",
			link: "/heute/verantwortung",
		});
}
