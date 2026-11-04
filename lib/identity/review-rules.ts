// Zugriffsprüfung (Rezertifizierung, Teil D I2): Regeln für Umfang,
// Entscheidung je Konto, Abschluss und Testergebnis. Rein, ohne
// Server-Importe.

export const REVIEW_SCOPES = ["all", "admins", "members"] as const;
export type ReviewScope = (typeof REVIEW_SCOPES)[number];

export const REVIEW_DECISIONS = ["confirm", "adjust", "revoke"] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

// Notiz bei „anpassen“ und „entziehen“ Pflicht: was genau soll passieren
export const REVIEW_NOTE_MIN = 5;

// Höchstens so viele Konten in einer Prüfung (wie beim Abruf)
export const REVIEW_MAX_ITEMS = 50_000;

export type ReviewAccount = {
	enabled: boolean;
	kind: "member" | "guest";
	isAdmin: boolean;
	isTopAdmin: boolean;
	missing: boolean;
};

// Welche Konten in die Prüfung gehören: nur aktive, noch gemeldete
export function inReviewScope(a: ReviewAccount, scope: ReviewScope): boolean {
	if (!a.enabled || a.missing) return false;
	if (scope === "admins") return a.isAdmin || a.isTopAdmin;
	if (scope === "members") return a.kind === "member";
	return true;
}

export type DecisionError = "identity_note_required" | "identity_decision";

export function decisionError(input: {
	decision: string;
	note: string | null;
}): DecisionError | null {
	if (!(REVIEW_DECISIONS as readonly string[]).includes(input.decision))
		return "identity_decision";
	if (
		input.decision !== "confirm" &&
		(input.note ?? "").trim().length < REVIEW_NOTE_MIN
	)
		return "identity_note_required";
	return null;
}

// Entscheiden darf die eingetragene Prüfer:in; Inhaber:innen springen ein
export function mayDecide(input: {
	reviewerUserId: string | null;
	userId: string;
	isOwner: boolean;
}): boolean {
	return input.isOwner || input.reviewerUserId === input.userId;
}

export type ReviewProgress = {
	total: number;
	open: number;
	confirm: number;
	adjust: number;
	revoke: number;
};

export function reviewProgress(
	items: readonly { decision: ReviewDecision | null }[],
): ReviewProgress {
	const p: ReviewProgress = {
		total: items.length,
		open: 0,
		confirm: 0,
		adjust: 0,
		revoke: 0,
	};
	for (const i of items) {
		if (i.decision === null) p.open += 1;
		else p[i.decision] += 1;
	}
	return p;
}

export function canClose(p: ReviewProgress): boolean {
	return p.total > 0 && p.open === 0;
}

// Die Prüfung ist gemacht (bestanden); wurde etwas entzogen oder
// angepasst, war der Zustand vorher nicht in Ordnung (teilweise)
export function reviewTestResult(p: ReviewProgress): "pass" | "partial" {
	return p.adjust + p.revoke > 0 ? "partial" : "pass";
}
