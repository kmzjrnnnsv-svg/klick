import type { RoleFunction } from "@/db/schema/enums";

// Funktion → Person, rein und an einer Stelle (Teil A „Rollen zu Beginn“).
// Eine Funktion kann mehrere Inhaber:innen haben (z. B. zwei
// Geschäftsführer:innen), eine Person mehrere Funktionen. Zeilen ohne
// Konto (extern, Einladung offen) zählen nicht als Person.
//
// Welche Sicht wo gilt:
// - Verantwortliche:r eines Eintrags: responsibleFor (erste Inhaber:in,
//   sonst die Vertretung)
// - Benachrichtigung und Freigabe: holders + deputies
// - Unterschrift: nur Inhaber:innen (lib/signatures, keine stille
//   Ausweitung auf die Vertretung)

export type FunctionAssignment = {
	function: RoleFunction;
	userId: string | null;
	deputyUserId: string | null;
	appointedAt?: string | null;
	createdAt?: Date | string | null;
};

const time = (v: Date | string | null | undefined): number =>
	v ? new Date(v).getTime() : Number.POSITIVE_INFINITY;

// nach Bestellung, dann nach Anlage — die zuerst bestellte Person führt
function ordered(rows: readonly FunctionAssignment[], fn: RoleFunction) {
	return rows
		.filter((r) => r.function === fn)
		.sort(
			(a, b) =>
				time(a.appointedAt) - time(b.appointedAt) ||
				time(a.createdAt) - time(b.createdAt),
		);
}

export function holdersOf(
	rows: readonly FunctionAssignment[],
	fn: RoleFunction,
): { holders: string[]; deputies: string[] } {
	const list = ordered(rows, fn);
	const holders = [
		...new Set(list.flatMap((r) => (r.userId ? [r.userId] : []))),
	];
	const deputies = [
		...new Set(
			list.flatMap((r) =>
				r.deputyUserId && !holders.includes(r.deputyUserId)
					? [r.deputyUserId]
					: [],
			),
		),
	];
	return { holders, deputies };
}

export function responsibleFor(
	rows: readonly FunctionAssignment[],
	fn: RoleFunction,
): string | null {
	const { holders, deputies } = holdersOf(rows, fn);
	return holders[0] ?? deputies[0] ?? null;
}

// alle, die es angeht: Inhaber:innen und Vertretungen
export function recipientsOf(
	rows: readonly FunctionAssignment[],
	fn: RoleFunction,
): string[] {
	const { holders, deputies } = holdersOf(rows, fn);
	return [...holders, ...deputies];
}

export type HeldFunction = { function: RoleFunction; as: "holder" | "deputy" };

export function functionsOf(
	rows: readonly FunctionAssignment[],
	userId: string,
): HeldFunction[] {
	const out: HeldFunction[] = [];
	const seen = new Set<string>();
	for (const r of rows) {
		const as =
			r.userId === userId
				? "holder"
				: r.deputyUserId === userId
					? "deputy"
					: null;
		if (!as) continue;
		const key = `${r.function}:${as}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push({ function: r.function, as });
	}
	// Inhaber:in vor Vertretung, dann in Katalog-Reihenfolge des Aufrufers
	return out.sort((a, b) => (a.as === b.as ? 0 : a.as === "holder" ? -1 : 1));
}
