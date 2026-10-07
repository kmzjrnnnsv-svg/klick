import { createHash } from "node:crypto";

// Hash-Kette für audit_log (ISO A.8.15, DORA Art. 10, MaRisk AT 7.2).
//
// Jede Kette läuft pro Mandant (organizationId) bzw. für Plattform-Ereignisse
// (organizationId = null) unter dem Schlüssel "platform". So kann eine Org ihre
// eigene Kette unter RLS vollständig prüfen, ohne fremde Zeilen zu sehen.
// Die Kette hängt an `hash = sha256(prevHash ?? "GENESIS" + "\n" + canonical(row))`;
// `seq` ist vom Hash ausgenommen (wird von Postgres vergeben).

export type AuditRowForHash = {
	id: string;
	organizationId: string | null;
	actorUserId: string | null;
	action: string;
	target: string | null;
	before: unknown;
	after: unknown;
	ip: string | null;
	userAgent: string | null;
	outcome: "success" | "failure" | "denied";
	at: Date | string;
};

export type HashedAuditRow = AuditRowForHash & {
	seq: number | bigint | string;
	prevHash: string | null;
	hash: string;
};

export const GENESIS = "GENESIS";

export function chainKey(organizationId: string | null | undefined): string {
	return organizationId ?? "platform";
}

// Deterministische JSON-Serialisierung: Schlüssel sortiert, undefined entfernt,
// Dates als ISO-String. Gleiche Daten → gleicher Hash, unabhängig von der
// Einfügereihenfolge der Objektschlüssel.
export function canonicalJson(value: unknown): string {
	return JSON.stringify(normalize(value));
}

function normalize(value: unknown): unknown {
	if (value === undefined) return null;
	if (value === null) return null;
	if (value instanceof Date) return value.toISOString();
	if (typeof value === "bigint") return value.toString();
	if (Array.isArray(value)) return value.map(normalize);
	if (typeof value === "object") {
		const out: Record<string, unknown> = {};
		for (const key of Object.keys(value as Record<string, unknown>).sort()) {
			const v = (value as Record<string, unknown>)[key];
			if (v === undefined) continue;
			out[key] = normalize(v);
		}
		return out;
	}
	return value;
}

export function computeAuditHash(
	prevHash: string | null,
	row: AuditRowForHash,
): string {
	const body = canonicalJson({
		id: row.id,
		organizationId: row.organizationId,
		actorUserId: row.actorUserId,
		action: row.action,
		target: row.target,
		before: row.before,
		after: row.after,
		ip: row.ip,
		userAgent: row.userAgent,
		outcome: row.outcome,
		at: row.at instanceof Date ? row.at.toISOString() : row.at,
	});
	return createHash("sha256")
		.update(`${prevHash ?? GENESIS}\n${body}`)
		.digest("hex");
}

export type ChainVerification =
	| { ok: true; checked: number }
	| {
			ok: false;
			checked: number;
			brokenAtSeq: string;
			reason: "hash_mismatch" | "prev_mismatch";
	  };

// Erwartet die Zeilen EINER Kette, aufsteigend nach seq sortiert.
export function verifyChain(rows: HashedAuditRow[]): ChainVerification {
	let expectedPrev: string | null = null;
	let checked = 0;
	for (const row of rows) {
		if (row.prevHash !== expectedPrev) {
			return {
				ok: false,
				checked,
				brokenAtSeq: String(row.seq),
				reason: "prev_mismatch",
			};
		}
		const recomputed = computeAuditHash(row.prevHash, row);
		if (recomputed !== row.hash) {
			return {
				ok: false,
				checked,
				brokenAtSeq: String(row.seq),
				reason: "hash_mismatch",
			};
		}
		expectedPrev = row.hash;
		checked++;
	}
	return { ok: true, checked };
}
