import type { BatchResponse } from "@/lib/wallet-link/contract";

// Regeln fürs Senden an Klick (pure): Wiederholung mit wachsendem Abstand,
// Auswertung der Antwort, Auswahl der Konten je Verbindung.

const MINUTE = 60_000;

// 1, 2, 4 … höchstens 60 Minuten
export function backoffMs(attempts: number): number {
	return Math.min(60 * MINUTE, MINUTE * 2 ** Math.max(0, attempts - 1));
}

export type SendOutcome =
	| { kind: "ok" }
	| { kind: "pause"; reason: "unauthorized" | "forbidden" | "gone" }
	| { kind: "retry"; error: string };

// HTTP-Status → was mit der Verbindung passiert
export function classifyStatus(status: number): SendOutcome {
	if (status >= 200 && status < 300) return { kind: "ok" };
	if (status === 401) return { kind: "pause", reason: "unauthorized" };
	if (status === 403) return { kind: "pause", reason: "forbidden" };
	if (status === 410) return { kind: "pause", reason: "gone" };
	return { kind: "retry", error: `HTTP ${status}` };
}

export type SentEvent = { id: string; seq: number; type: string };

// Antwort prüfen: jedes gesendete Ereignis braucht genau ein Ergebnis,
// sonst gilt der Stapel als nicht angekommen (Wiederholung).
export function applyResults(
	sent: readonly SentEvent[],
	res: BatchResponse,
	batchId: string,
):
	| { ok: true; rejected: (SentEvent & { code: string | null })[] }
	| { ok: false; error: string } {
	if (res.batchId !== batchId) return { ok: false, error: "batch_mismatch" };
	const byId = new Map(res.results.map((r) => [r.id, r]));
	if (byId.size !== res.results.length)
		return { ok: false, error: "results_duplicate" };
	const rejected: (SentEvent & { code: string | null })[] = [];
	for (const e of sent) {
		const r = byId.get(e.id);
		if (!r) return { ok: false, error: "results_missing" };
		if (r.result === "rejected") rejected.push({ ...e, code: r.code ?? null });
	}
	if (byId.size !== sent.length) return { ok: false, error: "results_extra" };
	return { ok: true, rejected };
}

// Gehört ein Ereignis zu den gewählten Konten (null = alle)? Konto-lose
// Ereignisse (Organisation, Zeremonie, Sanktionsliste, Lebenszeichen,
// Zieladressen, Signer-Meldungen) gehen immer mit. Der Tagesabschluss wird
// auf die gewählten Konten gekürzt.
export function scopeEvent(
	type: string,
	data: unknown,
	accountIds: readonly string[] | null,
): unknown | null {
	if (!accountIds) return data;
	const allowed = new Set(accountIds);
	const d = data as Record<string, unknown>;
	const accountOf = (key: string, field = "accountId") =>
		(d[key] as Record<string, unknown> | undefined)?.[field] as
			| string
			| undefined;
	switch (type) {
		case "account.upserted":
			return allowed.has(accountOf("account", "id") ?? "") ? data : null;
		case "transfer.upserted":
			return allowed.has(accountOf("transfer") ?? "") ? data : null;
		case "payout.upserted":
			return allowed.has(accountOf("payout") ?? "") ? data : null;
		case "day.closed":
			return {
				...d,
				accounts: (
					(d.accounts as { accountId: string }[] | undefined) ?? []
				).filter((a) => allowed.has(a.accountId)),
			};
		case "alert.raised": {
			const subject = d.subject as { kind: string; id: string } | null;
			if (subject?.kind === "account" && !allowed.has(subject.id)) return null;
			return data;
		}
		default:
			return data;
	}
}

// Beginn eines Berliner Kalendertags (YYYY-MM-DD) als Zeitpunkt — für die
// Nachlieferung „ab Datum“. Mitternacht liegt nie in der Umstellungsstunde.
export function berlinDayStart(day: string): Date {
	const [y, m, d] = day.split("-").map(Number);
	const utc = Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
	const fmt = new Intl.DateTimeFormat("en-CA", {
		timeZone: "Europe/Berlin",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	});
	for (const offset of [1, 2]) {
		const at = new Date(utc - offset * 3_600_000);
		if (fmt.format(at) === `${day}, 00:00`) return at;
	}
	throw new Error(`kein Berliner Tagesbeginn für ${day}`);
}

// Hinweis an die Inhaber:innen erst, wenn es länger hakt (6 Versuche ≈ 1 h)
export const NOTIFY_AFTER_ATTEMPTS = 6;

// Liste der abgelehnten Ereignisse: neueste zuerst, höchstens 50
export function mergeRejected<T extends { seq: number }>(
	prev: readonly T[] | null,
	next: readonly T[],
	cap = 50,
): T[] {
	return [...next, ...(prev ?? [])].sort((a, b) => b.seq - a.seq).slice(0, cap);
}
