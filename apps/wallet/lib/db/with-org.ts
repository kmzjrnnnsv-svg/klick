import { type DbTx, db } from "@wallet/db";
import { type Actor, type AuditInput, audit } from "@wallet/lib/audit";
import { sql } from "drizzle-orm";

// Kontext für jede Datenbankarbeit in both.money (wie Klick, lib/db/with-org).
// withOrg setzt app.org_id und — mit Person — app.user_id transaktionslokal;
// RLS filtert jede Tabelle auf die Org. withUser setzt nur die Person: so
// sieht ein Konto seine eigenen Mitgliedschaften (Org-Auswahl), sonst nichts.

export type OrgCtx = {
	orgId: string;
	userId: string | null;
	ip?: string | null;
	userAgent?: string | null;
};

export type OrgTx = DbTx;

async function setContext(
	tx: OrgTx,
	orgId: string | null,
	userId: string | null,
) {
	if (orgId)
		await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
	if (userId)
		await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
}

export async function withOrg<T>(
	ctx: OrgCtx,
	fn: (tx: OrgTx) => Promise<T>,
): Promise<T> {
	return db.transaction(async (tx) => {
		await setContext(tx, ctx.orgId, ctx.userId);
		return fn(tx);
	});
}

// Lesend: READ ONLY — versehentliches Schreiben bricht hart ab
export async function readOrg<T>(
	ctx: OrgCtx,
	fn: (tx: OrgTx) => Promise<T>,
): Promise<T> {
	return db.transaction(async (tx) => {
		await tx.execute(sql`set transaction read only`);
		await setContext(tx, ctx.orgId, ctx.userId);
		return fn(tx);
	});
}

export async function withUser<T>(
	userId: string,
	fn: (tx: OrgTx) => Promise<T>,
): Promise<T> {
	return db.transaction(async (tx) => {
		await tx.execute(sql`set transaction read only`);
		await setContext(tx, null, userId);
		return fn(tx);
	});
}

// Mutation + Audit atomar; der Eintrag ist die letzte Anweisung
export async function mutateOrg<T>(
	ctx: OrgCtx,
	fn: (tx: OrgTx) => Promise<{ result: T; audit: AuditInput | AuditInput[] }>,
): Promise<T> {
	return withOrg(ctx, async (tx) => {
		const { result, audit: entries } = await fn(tx);
		const actor: Actor = {
			userId: ctx.userId,
			ip: ctx.ip ?? null,
			userAgent: ctx.userAgent ?? null,
		};
		for (const entry of Array.isArray(entries) ? entries : [entries])
			await audit(tx, actor, { ...entry, organizationId: ctx.orgId });
		return result;
	});
}

export type PlatformCtx = {
	userId: string | null;
	reason: string;
	ip?: string | null;
	userAgent?: string | null;
};

// Plattform-Zugriff über alle Orgs (CLI, Jobs). Vorher mit Begründung
// auditiert — in eigener Transaktion, damit auch ein Fehlschlag Spuren lässt.
export async function withPlatform<T>(
	ctx: PlatformCtx,
	fn: (tx: OrgTx) => Promise<T>,
): Promise<T> {
	if (!ctx.reason || ctx.reason.trim().length < 3)
		throw new Error("withPlatform verlangt eine Begründung (reason)");
	await db.transaction(async (tx) => {
		await tx.execute(sql`select set_config('app.scope', 'platform', true)`);
		await audit(
			tx,
			{
				userId: ctx.userId,
				ip: ctx.ip ?? null,
				userAgent: ctx.userAgent ?? null,
			},
			{ action: "platform.access", after: { reason: ctx.reason } },
		);
	});
	return db.transaction(async (tx) => {
		await tx.execute(sql`select set_config('app.scope', 'platform', true)`);
		return fn(tx);
	});
}

// Jobs: eine Org nach der anderen, jede im eigenen Kontext
export async function forEachOrg(
	orgIds: readonly string[],
	fn: (tx: OrgTx, orgId: string) => Promise<void>,
): Promise<void> {
	for (const orgId of orgIds)
		await withOrg({ orgId, userId: null }, (tx) => fn(tx, orgId));
}
