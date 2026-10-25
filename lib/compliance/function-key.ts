import {
	type FunctionKey,
	ROLE_FUNCTIONS,
	type RoleFunction,
} from "@/db/schema/enums";

// Funktionsschlüssel (ADR-024): eine Funktion aus dem Katalog oder eine
// eigene Rolle der Org als `role:<id>` (org_roles). Überall, wo eine
// Funktion verantwortlich ist, bestellt wird oder berichtet — owner_function,
// role_assignments, Organigramm. Pure, auch im Browser nutzbar.

export const OWN_ROLE_PREFIX = "role:";

export type { FunctionKey };
export type OwnRoleKey = `role:${string}`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isOwnRoleKey(key: string): key is OwnRoleKey {
	return (
		key.startsWith(OWN_ROLE_PREFIX) &&
		UUID.test(key.slice(OWN_ROLE_PREFIX.length))
	);
}

export function isFunctionKey(key: string): key is FunctionKey {
	return (
		(ROLE_FUNCTIONS as readonly string[]).includes(key) || isOwnRoleKey(key)
	);
}

export const ownRoleKey = (id: string): OwnRoleKey => `${OWN_ROLE_PREFIX}${id}`;

export function ownRoleIdOf(key: string | null | undefined): string | null {
	return key && isOwnRoleKey(key) ? key.slice(OWN_ROLE_PREFIX.length) : null;
}

// Schlüssel einer Besetzung: eigene Rolle vor der Katalog-Funktion
// (bei eigenen Rollen steht function = other)
export function functionKeyOf(row: {
	function: RoleFunction;
	orgRoleId?: string | null;
}): FunctionKey {
	return row.orgRoleId ? ownRoleKey(row.orgRoleId) : row.function;
}

// Spalten einer Besetzung aus dem Schlüssel
export function assignmentColumns(key: FunctionKey): {
	function: RoleFunction;
	orgRoleId: string | null;
} {
	const id = ownRoleIdOf(key);
	return id
		? { function: "other", orgRoleId: id }
		: { function: key as RoleFunction, orgRoleId: null };
}

// Anzeige: Katalog-Funktion über die Übersetzung, eigene Rolle über ihren
// Namen (fehlt er, ist die Rolle gelöscht)
export function functionLabel(
	key: FunctionKey,
	catalog: (fn: RoleFunction) => string,
	roleNames: ReadonlyMap<string, string> | Readonly<Record<string, string>>,
	removed = "Rolle entfernt",
): string {
	const id = ownRoleIdOf(key);
	if (!id) return catalog(key as RoleFunction);
	const name =
		roleNames instanceof Map
			? roleNames.get(id)
			: (roleNames as Readonly<Record<string, string>>)[id];
	return name ?? removed;
}
