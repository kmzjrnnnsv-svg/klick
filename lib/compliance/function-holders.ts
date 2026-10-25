import type { RoleFunction } from "@/db/schema/enums";
import {
	checkSod,
	SOD_RULES,
	type SodRule,
} from "@/lib/compliance/catalog/sod-rules";

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

// ── „Wer trägt was“ (Einrichtung, /organisation) ─────────────────────────
// Je Person ihre Funktionen und die Funktionstrennungs-Hinweise. Eingeladene
// zählen über ihre Adresse, Externe über den Namen — sonst fielen unzulässige
// Kombinationen erst nach der Annahme auf. Kein Verbot: kleine Firmen müssen
// kombinieren dürfen, Prüfer:innen sehen die Hinweise.

export type HolderRow = {
	function: RoleFunction;
	userId: string | null;
	externalName: string | null;
	pendingEmail: string | null;
	deputyUserId: string | null;
	userName: string | null;
	deputyName: string | null;
};

export type PersonView = {
	key: string;
	name: string;
	kind: "member" | "invite" | "external";
	functions: {
		function: RoleFunction;
		title: string;
		as: "holder" | "deputy";
	}[];
	sod: Pick<SodRule, "code" | "text" | "severity">[];
};

function personOf(r: HolderRow) {
	if (r.userId)
		return { key: r.userId, name: r.userName ?? "—", kind: "member" as const };
	if (r.pendingEmail)
		return {
			key: `invite:${r.pendingEmail.toLowerCase()}`,
			name: r.externalName ?? r.pendingEmail,
			kind: "invite" as const,
		};
	if (r.externalName)
		return {
			key: `ext:${r.externalName.trim().toLowerCase()}`,
			name: r.externalName,
			kind: "external" as const,
		};
	return null;
}

export function whoHoldsWhat(
	rows: readonly HolderRow[],
	title: (fn: RoleFunction) => string,
	rules: readonly SodRule[] = SOD_RULES,
): PersonView[] {
	const people = new Map<string, PersonView>();
	const add = (
		p: { key: string; name: string; kind: PersonView["kind"] },
		fn: RoleFunction,
		as: "holder" | "deputy",
	) => {
		const v = people.get(p.key) ?? { ...p, functions: [], sod: [] };
		if (!v.functions.some((f) => f.function === fn && f.as === as))
			v.functions.push({ function: fn, title: title(fn), as });
		people.set(p.key, v);
	};
	for (const r of rows) {
		const p = personOf(r);
		if (p) add(p, r.function, "holder");
		// Altdaten: Vertretung = Inhaber:in zählt nicht als Vertretung
		if (r.deputyUserId && r.deputyUserId !== r.userId)
			add(
				{ key: r.deputyUserId, name: r.deputyName ?? "—", kind: "member" },
				r.function,
				"deputy",
			);
	}
	const keyed = rows.flatMap((r) => {
		const p = personOf(r);
		return p ? [{ function: r.function, userId: p.key }] : [];
	});
	for (const v of checkSod(keyed, rules)) {
		const p = people.get(v.userId);
		if (p && !p.sod.some((s) => s.code === v.rule.code))
			p.sod.push({
				code: v.rule.code,
				text: v.rule.text,
				severity: v.rule.severity,
			});
	}
	for (const p of people.values())
		p.functions.sort((a, b) =>
			a.as === b.as ? 0 : a.as === "holder" ? -1 : 1,
		);
	return [...people.values()].sort(
		(a, b) =>
			b.functions.length - a.functions.length ||
			a.name.localeCompare(b.name, "de"),
	);
}
