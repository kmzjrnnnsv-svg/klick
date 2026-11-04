// Identität anbinden (Teil D): Schwellen der Prüfungen je Org. Rein.
// Gespeichert als JSON; gelesen nur über identityPolicyOf, damit ein
// kaputter oder manipulierter Wert nie eine Prüfung aushebelt.

export type IdentityPolicy = {
	// MFA-Quote in Prozent, darunter „nicht bestanden“
	mfaFailBelow: number;
	// höchste Rolle (Global Administrator, Super-Admin) höchstens so oft
	maxTopAdmins: number;
	// Tage, die ein ausgeschiedenes Konto noch aktiv sein darf
	leaverGraceDays: number;
	// ohne Anmeldung seit so vielen Tagen = inaktiv
	inactiveDays: number;
	// nie angemeldet und seit so vielen Tagen angelegt
	neverSignedInDays: number;
	// letzte Rezertifizierung höchstens so alt für „bestanden“
	recertPassDays: number;
	// älter als das = „nicht bestanden“
	recertFailDays: number;
	// Abgleich älter als das = „nicht bewertbar“ (fest, nicht einstellbar)
	staleHours: number;
};

export const DEFAULT_IDENTITY_POLICY: IdentityPolicy = {
	mfaFailBelow: 95,
	maxTopAdmins: 4,
	leaverGraceDays: 3,
	inactiveDays: 90,
	neverSignedInDays: 30,
	recertPassDays: 90,
	recertFailDays: 120,
	staleHours: 72,
};

export type IdentityPolicyKey = Exclude<keyof IdentityPolicy, "staleHours">;
type Bounded = IdentityPolicyKey;

// Grenzen je Schwelle (Formular und Lesen); Reihenfolge = Formular
export const IDENTITY_POLICY_BOUNDS: Record<
	IdentityPolicyKey,
	readonly [number, number]
> = {
	mfaFailBelow: [50, 100],
	maxTopAdmins: [1, 20],
	leaverGraceDays: [0, 30],
	inactiveDays: [30, 365],
	neverSignedInDays: [7, 180],
	recertPassDays: [30, 365],
	recertFailDays: [30, 730],
};

function boundedInt(value: unknown, [min, max]: readonly [number, number]) {
	if (typeof value !== "number" || !Number.isInteger(value)) return null;
	return value >= min && value <= max ? value : null;
}

export function identityPolicyOf(raw: unknown): IdentityPolicy {
	const obj =
		raw !== null && typeof raw === "object" && !Array.isArray(raw)
			? (raw as Record<string, unknown>)
			: {};
	const d = DEFAULT_IDENTITY_POLICY;
	const pick = (key: Bounded) =>
		boundedInt(obj[key], IDENTITY_POLICY_BOUNDS[key]) ?? d[key];
	let recertPassDays = pick("recertPassDays");
	let recertFailDays = pick("recertFailDays");
	// „nicht bestanden“ vor „bestanden“ ergäbe keinen Sinn: beide auf Standard
	if (recertFailDays < recertPassDays) {
		recertPassDays = d.recertPassDays;
		recertFailDays = d.recertFailDays;
	}
	return {
		mfaFailBelow: pick("mfaFailBelow"),
		maxTopAdmins: pick("maxTopAdmins"),
		leaverGraceDays: pick("leaverGraceDays"),
		inactiveDays: pick("inactiveDays"),
		neverSignedInDays: pick("neverSignedInDays"),
		recertPassDays,
		recertFailDays,
		// wer den Abgleich abschaltet, soll nicht ewig „bestanden“ sehen
		staleHours: d.staleHours,
	};
}

// Lockern = mindestens eine Schwelle nachsichtiger (dann Vier-Augen)
export function identityPolicyRelaxed(
	prev: IdentityPolicy,
	next: IdentityPolicy,
): boolean {
	return (
		next.mfaFailBelow < prev.mfaFailBelow ||
		next.maxTopAdmins > prev.maxTopAdmins ||
		next.leaverGraceDays > prev.leaverGraceDays ||
		next.inactiveDays > prev.inactiveDays ||
		next.neverSignedInDays > prev.neverSignedInDays ||
		next.recertPassDays > prev.recertPassDays ||
		next.recertFailDays > prev.recertFailDays
	);
}
