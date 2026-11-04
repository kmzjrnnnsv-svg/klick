// Identität anbinden (Teil D): Konten des Anbieters Personen in Klick
// zuordnen. Rein. Automatisch nur über die exakte Adresse in einer
// bestätigten Domain und nur, wenn sie eindeutig ist — eine falsche
// Zuordnung wäre schlimmer als keine (Austritt, Rezertifizierung).

export type MatchAccount = {
	id: string;
	email: string | null;
	kind: "member" | "guest";
	matchMode: "auto" | "manual" | "none";
	matchedUserId: string | null;
};

export type MatchPerson = { userId: string; email: string };

const normalize = (email: string | null) => email?.trim().toLowerCase() ?? "";

// Teil nach dem letzten @, klein geschrieben; null ohne gültige Adresse
export function emailDomain(email: string | null): string | null {
	const value = normalize(email);
	const at = value.lastIndexOf("@");
	if (at < 1 || at === value.length - 1) return null;
	return value.slice(at + 1);
}

function countBy<T>(items: readonly T[], key: (item: T) => string) {
	const counts = new Map<string, number>();
	for (const item of items) {
		const k = key(item);
		if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
	}
	return counts;
}

// Für jedes Konto die zu speichernde Person (oder null)
export function matchAccounts(input: {
	accounts: readonly MatchAccount[];
	people: readonly MatchPerson[];
	verifiedDomains: readonly string[];
}): Map<string, string | null> {
	const domains = new Set(
		input.verifiedDomains.map((d) => d.trim().toLowerCase()),
	);
	const accountCounts = countBy(input.accounts, (a) => normalize(a.email));
	const personCounts = countBy(input.people, (p) => normalize(p.email));
	const personByEmail = new Map(
		input.people.map((p) => [normalize(p.email), p.userId] as const),
	);

	const auto = (account: MatchAccount): string | null => {
		// Gäste gehören zu einer fremden Firma, nie automatisch zuordnen
		if (account.kind !== "member") return null;
		const domain = emailDomain(account.email);
		if (domain === null || !domains.has(domain)) return null;
		const email = normalize(account.email);
		// doppelt beim Anbieter oder in Klick = nicht eindeutig
		if (accountCounts.get(email) !== 1) return null;
		if (personCounts.get(email) !== 1) return null;
		return personByEmail.get(email) ?? null;
	};

	const result = new Map<string, string | null>();
	for (const account of input.accounts) {
		// von Hand gesetzt (auch „niemand“) bleibt, wie es ist
		result.set(
			account.id,
			account.matchMode === "manual" ? account.matchedUserId : auto(account),
		);
	}
	return result;
}
