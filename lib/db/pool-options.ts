// Zeitgrenzen je Verbindungspool (P4, Nov 2026), rein und getestet.
//
// Seiten und Actions (Pool „web“) brechen eine einzelne Anweisung nach 30 s
// ab und warten höchstens 5 s auf eine Sperre — eine hängende Abfrage oder
// eine fremde Sperre hält sonst eine der zehn Verbindungen fest, und alle
// anderen Seiten warten mit. Die Grenze gilt je Anweisung, nicht je
// Transaktion: ein Export aus vielen kurzen Abfragen läuft durch. Wer eine
// einzelne lange Abfrage braucht (Org-Export), hebt sie mit longRunning()
// (lib/db/with-org.ts) für die eigene Transaktion an.
//
// Jobs (Pool „jobs“, lib/db/job-scope.ts) laufen im Hintergrund und dürfen
// länger: 10 min je Anweisung, 30 s auf eine Sperre.
//
// Skripte am Terminal und Tests (kein NEXT_RUNTIME) bekommen keine Grenze:
// Migrationen, KEK-Rotation und Seeds sollen nicht mittendrin abbrechen.

export type PoolKind = "web" | "jobs";

export const POOL_LIMITS: Record<
	PoolKind,
	{ statementMs: number; lockMs: number; max: number }
> = {
	web: { statementMs: 30_000, lockMs: 5_000, max: 10 },
	jobs: { statementMs: 600_000, lockMs: 30_000, max: 4 },
};

// Startparameter der Verbindung (postgres.js `connection`), oder undefined
export function poolConnection(
	kind: PoolKind,
	runtime: string | undefined = process.env.NEXT_RUNTIME,
): { statement_timeout: number; lock_timeout: number } | undefined {
	if (runtime !== "nodejs") return undefined;
	const l = POOL_LIMITS[kind];
	return { statement_timeout: l.statementMs, lock_timeout: l.lockMs };
}

// Obergrenze für longRunning(): auch ein Export soll nicht ewig laufen
export const LONG_RUNNING_MAX_MS = 15 * 60_000;

export function clampLongRunning(ms: number): number {
	if (!Number.isFinite(ms) || ms <= 0) return POOL_LIMITS.web.statementMs;
	return Math.min(Math.floor(ms), LONG_RUNNING_MAX_MS);
}
