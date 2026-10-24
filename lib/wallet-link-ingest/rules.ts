import type { CryptoAlertEffect } from "@/db/schema/wallet-link";
import type { AlertCode } from "@/lib/wallet-link/events";

// Empfang aus both.money (Plan both.money, K3) — reine Regeln: Ergebnis je
// Ereignis, Wirkung je Hinweis, Abbildung aufs Verwahrungs-Register.

export type StoredEvent = {
	hash: string;
	result: "accepted" | "ignored" | "rejected";
	code: string | null;
};

export type EventOutcome =
	| { kind: "new" }
	| {
			kind: "known";
			result: "duplicate" | "ignored" | "rejected";
			code?: string;
	  }
	| { kind: "conflict" };

// Gleiche ID, gleiche Prüfsumme = schon da (Antwort wie beim ersten Mal,
// angenommen → „duplicate“); gleiche ID, andere Prüfsumme = Widerspruch.
export function eventOutcome(
	stored: StoredEvent | null,
	hash: string,
): EventOutcome {
	if (!stored) return { kind: "new" };
	if (stored.hash !== hash) return { kind: "conflict" };
	if (stored.result === "accepted")
		return { kind: "known", result: "duplicate" };
	return {
		kind: "known",
		result: stored.result,
		...(stored.code ? { code: stored.code } : {}),
	};
}

// Zuordnung der Auffälligkeiten (Plan both.money, Standards): unbekannte
// Ausgabe und zurückgelaufenes Journal → Vorfall; Sanktionstreffer →
// Verdachtsfall (ohne Personendaten) + Aufgabe; Rest → Aufgabe.
export function alertEffect(code: AlertCode): CryptoAlertEffect {
	switch (code) {
		case "unknown_spend":
		case "journal_regressed":
			return "incident";
		case "sanctions_hit":
			return "suspicious_report";
		default:
			return "task";
	}
}

export function taskPriority(
	severity: "critical" | "high" | "medium",
): "critical" | "high" | "normal" {
	return severity === "critical"
		? "critical"
		: severity === "high"
			? "high"
			: "normal";
}

// Was die verantwortliche Person mit dem Hinweis tun soll (Aufgabentext)
export const ALERT_TODO: Record<AlertCode, string> = {
	unknown_spend:
		"Ausgabe ohne Auszahlung in both.money: Signer ist eingefroren. Ursache klären, Vorfall bewerten und melden.",
	journal_regressed:
		"Das Signer-Journal ist zurückgelaufen: Signer eingefroren lassen, echtes Journal aus dem Backup bestimmen.",
	sanctions_hit:
		"Eingang von einer gesperrten Adresse ist eingefroren. Verdachtsfall prüfen, Meldung an die FIU und Bundesbank (Finanzsanktionen) prüfen, Gelder nicht freigeben.",
	manual_stop:
		"Jemand hat in both.money „Alles stoppen“ gedrückt. Grund klären; auftauen nur am Server-Terminal.",
	signer_frozen:
		"Der Signer ist eingefroren. Grund klären; auftauen nur am Server-Terminal.",
	signer_unreachable:
		"Der Signer ist nicht erreichbar, Auszahlungen ruhen. Dienst und Socket prüfen.",
	node_mismatch:
		"Ein Knoten weicht von den selbst abgeleiteten Adressen ab, das Konto ist angehalten. Knoten und Konto prüfen.",
};

// Konto aus both.money → Eintrag im Verwahrungs-Register
export function registerWallet(a: {
	name: string;
	network: string;
	kind: string;
	purpose: string;
	keyFingerprint: string;
	firstAddress: string | null;
	status: string;
}): {
	name: string;
	kind: "hot" | "cold";
	purpose: "client" | "own";
	addressLabel: string;
	status: "active" | "retired";
} {
	return {
		name: `${a.name} (both.money)`,
		kind: a.kind === "hot" ? "hot" : "cold",
		purpose: a.purpose === "client" ? "client" : "own",
		addressLabel: a.firstAddress ?? `Fingerprint ${a.keyFingerprint}`,
		status: a.status === "retired" ? "retired" : "active",
	};
}

// Richtlinie des Signers → Quorum der Hot-Wallets (Vier-Augen = 2)
export function quorumFrom(c: {
	policy: { mode: string };
	keys: { persons: number };
}): { required: number; total: number } {
	const required = c.policy.mode === "four_eyes" ? 2 : 1;
	return { required, total: Math.max(required, c.keys.persons) };
}

// Zeremonie-Anlass → Art im Register (Richtlinie allein ist keine Zeremonie)
export function ceremonyKind(
	reason: "initialised" | "policy_changed" | "keys_changed",
): "generation" | "rotation" | null {
	return reason === "initialised"
		? "generation"
		: reason === "keys_changed"
			? "rotation"
			: null;
}

// Berliner Kalendertag eines Zeitpunkts
export function berlinDay(at: Date): string {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "Europe/Berlin",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(at);
}
