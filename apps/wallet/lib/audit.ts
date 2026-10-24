import { type DbTx, db, type WalletDb } from "@wallet/db";
import { auditLog, exportChanges } from "@wallet/db/schema";
import { ALERT_AUDIT_ACTIONS } from "@wallet/lib/export/alerts";
import { hasLinks } from "@wallet/lib/export/emit";
import { desc, eq, isNull, sql } from "drizzle-orm";
import {
	type ChainVerification,
	chainKey,
	computeAuditHash,
	type HashedAuditRow,
	verifyChain,
} from "@/lib/audit-hash";

// Audit-Log von both.money: nur anhängend, SHA-256-Kette je Org bzw.
// Plattform (gemeinsame Regel lib/audit-hash.ts). Der Advisory-Lock
// serialisiert Schreiber derselben Kette.

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

const LOCK_NAMESPACE = 7270002;

type Executor = DbTx | WalletDb;

export async function audit(
	tx: Executor,
	actor: Actor,
	input: AuditInput,
): Promise<{ id: string; hash: string; prevHash: string | null }> {
	const orgId = input.organizationId ?? null;
	await tx.execute(
		sql`select pg_advisory_xact_lock(${LOCK_NAMESPACE}, hashtext(${chainKey(orgId)}))`,
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
	const row = {
		id: crypto.randomUUID(),
		organizationId: orgId,
		actorUserId: actor.userId,
		action: input.action,
		target: input.target ?? null,
		before: input.before ?? null,
		after: input.after ?? null,
		ip: actor.ip ?? null,
		userAgent: actor.userAgent ?? null,
		outcome: input.outcome ?? ("success" as const),
		at: new Date(),
	};
	const hash = computeAuditHash(prevHash, row);
	await tx.insert(auditLog).values({ ...row, prevHash, hash });
	// Auffälligkeiten für den Export nach Klick vermerken (dieselbe
	// Transaktion; der Export-Lauf macht daraus alert.raised)
	if (
		orgId &&
		ALERT_AUDIT_ACTIONS.has(input.action) &&
		(await hasLinks(tx as DbTx, orgId))
	)
		await tx.insert(exportChanges).values({
			organizationId: orgId,
			entity: "audit",
			entityId: row.id,
		});
	return { id: row.id, hash, prevHash };
}

// Plattform-Ereignisse (Auth-Hooks, CLI) ohne Org-Kontext
export async function auditPlatform(
	actor: Actor,
	input: AuditInput,
): Promise<{ id: string; hash: string }> {
	return db.transaction(async (tx) => {
		await tx.execute(sql`select set_config('app.scope', 'platform', true)`);
		return audit(tx, actor, input);
	});
}

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

export function targetOf(kind: string, id: string): string {
	return `${kind}:${id}`;
}
