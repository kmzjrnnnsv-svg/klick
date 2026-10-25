import { eq } from "drizzle-orm";
import { roleAssignments } from "@/db/schema";
import type { RoleFunction } from "@/db/schema/enums";
import {
	type FunctionAssignment,
	type ResponsibleOption,
	recipientsOf,
	responsibleFor,
} from "@/lib/compliance/function-holders";
import { userNames } from "@/lib/compliance/queries";
import type { OrgTx } from "@/lib/db/with-org";
import { functionOfRef } from "@/lib/validation/responsible";

// Lader zu lib/compliance/function-holders.ts (im Org-Kontext)

export async function loadAssignments(
	tx: OrgTx,
	orgId: string,
): Promise<FunctionAssignment[]> {
	return tx
		.select({
			function: roleAssignments.function,
			userId: roleAssignments.userId,
			deputyUserId: roleAssignments.deputyUserId,
			appointedAt: roleAssignments.appointedAt,
			createdAt: roleAssignments.createdAt,
		})
		.from(roleAssignments)
		.where(eq(roleAssignments.organizationId, orgId));
}

// Verantwortliche:r für Einträge dieser Funktion (Inhaber:in, sonst Vertretung)
export async function functionResponsible(
	tx: OrgTx,
	orgId: string,
	fn: RoleFunction,
): Promise<string | null> {
	return responsibleFor(await loadAssignments(tx, orgId), fn);
}

// Empfänger:innen einer Benachrichtigung an die Funktion
export async function functionRecipients(
	tx: OrgTx,
	orgId: string,
	fn: RoleFunction,
): Promise<string[]> {
	return recipientsOf(await loadAssignments(tx, orgId), fn);
}

// Formularwert (Konto-ID oder `function:<key>`) → Spalten. undefined = nicht
// ändern, null = niemand. Bei einer Funktion ohne Inhaber:in bleibt die
// bisherige Person (fallback) eingetragen.
export async function resolveResponsible(
	tx: OrgTx,
	orgId: string,
	ref: string | null | undefined,
	fallback: string | null,
): Promise<
	{ ownerUserId: string | null; ownerFunction: RoleFunction | null } | undefined
> {
	if (ref === undefined) return undefined;
	const fn = functionOfRef(ref);
	if (!fn) return { ownerUserId: ref, ownerFunction: null };
	const person = responsibleFor(await loadAssignments(tx, orgId), fn);
	return { ownerUserId: person ?? fallback, ownerFunction: fn };
}

// besetzte Funktionen mit Name der verantwortlichen Person — für die Auswahl
export async function responsibleOptions(
	tx: OrgTx,
	orgId: string,
): Promise<ResponsibleOption[]> {
	const rows = await loadAssignments(tx, orgId);
	const fns = [...new Set(rows.map((r) => r.function))];
	const people = fns.map((fn) => responsibleFor(rows, fn));
	const names = await userNames(tx, people);
	return fns
		.map((fn, i) => {
			const p = people[i];
			return { function: fn, holder: p ? (names.get(p) ?? null) : null };
		})
		.filter((o) => o.holder);
}

// Für Anlegen und Speichern: Formularwert → beide Spalten. Ohne Wert gilt
// `fallback` als Person (z. B. die anlegende Person), ohne Funktion.
export async function ownerColumns(
	tx: OrgTx,
	orgId: string,
	ref: string | null | undefined,
	fallback: string | null,
): Promise<{ ownerUserId: string | null; ownerFunction: RoleFunction | null }> {
	return (
		(await resolveResponsible(tx, orgId, ref, fallback)) ?? {
			ownerUserId: fallback,
			ownerFunction: null,
		}
	);
}
