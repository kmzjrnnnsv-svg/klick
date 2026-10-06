import { desc, eq, isNull, sql } from "drizzle-orm";
import type { DbTx, GlobalDb } from "@/db";
import { globalDb } from "@/db";
import { auditLog } from "@/db/schema";
import {
	type ChainVerification,
	chainKey,
	computeAuditHash,
	type HashedAuditRow,
	verifyChain,
} from "./audit-hash";

// Audit-Log: append-only, SHA-256-Hash-Kette je Org (bzw. "platform").
//
// `audit(tx, actor, input)` ist immer die LETZTE Anweisung einer withOrg-
// Transaktion → Mutation und Protokoll sind atomar. Der Advisory-Lock
// (xact-scoped) serialisiert konkurrierende Schreiber derselben Kette, damit
// prevHash nie doppelt verwendet wird.

export type AuditOutcome = "success" | "failure" | "denied";

export type AuditInput = {
	action: string;
	target?: string | null;
	before?: unknown;
	after?: unknown;
	outcome?: AuditOutcome;
	organizationId?: string | null;
};

export type Actor = {
	userId: string | null;
	ip?: string | null;
	userAgent?: string | null;
};

const LOCK_NAMESPACE = 7270001;

type Executor = DbTx | GlobalDb;

export async function audit(
	tx: Executor,
	actor: Actor,
	input: AuditInput,
): Promise<{ id: string; hash: string; prevHash: string | null }> {
	const orgId = input.organizationId ?? null;
	const key = chainKey(orgId);
	await tx.execute(
		sql`select pg_advisory_xact_lock(${LOCK_NAMESPACE}, hashtext(${key}))`,
	);
	const [prev] = await tx
		.select({ hash: auditLog.hash })
		.from(auditLog)
		.where(
			orgId
				? eq(auditLog.organizationId, orgId)
				: isNull(auditLog.organizationId),
		)
		.orderBy(desc(auditLog.seq))
		.limit(1);
	const prevHash = prev?.hash ?? null;
	const id = crypto.randomUUID();
	const at = new Date();
	const row = {
		id,
		organizationId: orgId,
		actorUserId: actor.userId,
		action: input.action,
		target: input.target ?? null,
		before: input.before ?? null,
		after: input.after ?? null,
		ip: actor.ip ?? null,
		userAgent: actor.userAgent ?? null,
		outcome: input.outcome ?? ("success" as const),
		at,
	};
	const hash = computeAuditHash(prevHash, row);
	await tx.insert(auditLog).values({ ...row, prevHash, hash });
	return { id, hash, prevHash };
}

// Plattform-Ereignisse (Auth-Hooks, Admin) laufen ohne Org-Kontext. Eigene
// Transaktion mit app.scope = platform, damit die INSERT-Policy greift.
export async function auditPlatform(
	actor: Actor,
	input: AuditInput,
): Promise<{ id: string; hash: string }> {
	return globalDb.transaction(async (tx) => {
		await tx.execute(sql`select set_config('app.scope', 'platform', true)`);
		return audit(tx, actor, input);
	});
}

// Prüft die Kette einer Org (oder der Plattform) vollständig.
export async function verifyAuditChain(
	tx: Executor,
	organizationId: string | null,
): Promise<ChainVerification> {
	const rows = await tx
		.select()
		.from(auditLog)
		.where(
			organizationId
				? eq(auditLog.organizationId, organizationId)
				: isNull(auditLog.organizationId),
		)
		.orderBy(auditLog.seq);
	return verifyChain(rows as unknown as HashedAuditRow[]);
}

// Feld-Historie einer Entität ("risk:<id>") für den Aktivitätsstrom.
export async function historyFor(tx: Executor, target: string, limit = 200) {
	return tx
		.select()
		.from(auditLog)
		.where(eq(auditLog.target, target))
		.orderBy(desc(auditLog.seq))
		.limit(limit);
}

export function targetOf(kind: string, id: string): string {
	return `${kind}:${id}`;
}
