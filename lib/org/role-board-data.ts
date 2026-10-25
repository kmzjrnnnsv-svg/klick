import { and, eq, ne } from "drizzle-orm";
import type {
	BoardArea,
	BoardPerson,
	BoardRole,
} from "@/components/organisation/role-board";
import { orgSettings, roleAssignments } from "@/db/schema";
import {
	type FunctionKey,
	ROLE_FUNCTIONS,
	type RoleFunction,
} from "@/db/schema/enums";
import { RESPONSIBILITY_AREAS } from "@/lib/compliance/catalog/domain-functions";
import { functionKeyOf, ownRoleKey } from "@/lib/compliance/function-key";
import { listMembersForPicker, userNames } from "@/lib/compliance/queries";
import type { OrgTx } from "@/lib/db/with-org";
import { orgRoleNames } from "./roles";

// Daten der Rollen-Tafel (ADR-024, individueller Modus) für /organisation
// und die Einrichtung: Pflichtfunktionen zuerst, dann der übrige Katalog,
// eigene Rollen danach; je Rolle Bestellte und Vorgeschlagene, Personen aus
// Mitgliedern und offenen Einladungen, Bereiche mit ihrer Funktion.
export async function loadRoleBoard(
	tx: OrgTx,
	orgId: string,
	input: {
		required: readonly RoleFunction[];
		functionLabels: Record<string, string>;
		areaLabel: (area: string) => string;
		invitations: readonly { email: string }[];
	},
): Promise<{ roles: BoardRole[]; people: BoardPerson[]; areas: BoardArea[] }> {
	const rows = await tx
		.select({
			id: roleAssignments.id,
			function: roleAssignments.function,
			orgRoleId: roleAssignments.orgRoleId,
			userId: roleAssignments.userId,
			pendingEmail: roleAssignments.pendingEmail,
			externalName: roleAssignments.externalName,
			status: roleAssignments.status,
		})
		.from(roleAssignments)
		.where(
			and(
				eq(roleAssignments.organizationId, orgId),
				ne(roleAssignments.status, "revoked"),
				ne(roleAssignments.status, "rejected"),
			),
		)
		.orderBy(roleAssignments.appointedAt, roleAssignments.createdAt);
	const names = await userNames(
		tx,
		rows.map((r) => r.userId),
	);
	const roleNames = await orgRoleNames(tx, orgId);
	const [s] = await tx
		.select({ areaFunctions: orgSettings.areaFunctions })
		.from(orgSettings)
		.where(eq(orgSettings.organizationId, orgId))
		.limit(1);
	const members = await listMembersForPicker(tx, orgId);

	const catalog = [
		...input.required,
		...ROLE_FUNCTIONS.filter((f) => f !== "other"),
	].filter((f, i, all) => all.indexOf(f) === i);
	const roles: BoardRole[] = [
		...catalog.map((f) => ({
			key: f as FunctionKey,
			label: input.functionLabels[f] ?? f,
			required: input.required.includes(f),
			own: false,
		})),
		...Object.entries(roleNames).map(([id, name]) => ({
			key: ownRoleKey(id),
			label: name,
			required: false,
			own: true,
		})),
	].map((r) => ({
		...r,
		holders: rows
			.filter((a) => functionKeyOf(a) === r.key)
			.map((a) => ({
				id: a.id,
				userId: a.userId,
				pendingEmail: a.pendingEmail,
				name:
					(a.userId ? names.get(a.userId) : undefined) ??
					a.externalName ??
					a.pendingEmail ??
					"—",
				status: a.status,
			})),
	}));
	const people: BoardPerson[] = [
		...members.map((m) => ({
			userId: m.userId,
			pendingEmail: null,
			name: m.name,
		})),
		...input.invitations.map((i) => ({
			userId: null,
			pendingEmail: i.email.toLowerCase(),
			name: i.email,
		})),
	];
	const areas: BoardArea[] = RESPONSIBILITY_AREAS.map((area) => ({
		area,
		label: input.areaLabel(area),
		fn: s?.areaFunctions?.[area] ?? null,
	}));
	return { roles, people, areas };
}
