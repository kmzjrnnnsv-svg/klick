import { sql } from "drizzle-orm";
import { type DbTx, globalDb } from "@/db";
import { type Actor, type AuditInput, audit } from "@/lib/audit";
import { dbForOrg } from "./router";

// Mandanten-Kontext für jede Datenbankarbeit.
//
// withOrg(ctx, fn) öffnet eine Transaktion und setzt app.org_id
// transaktionslokal (set_config(…, true)). Postgres-RLS filtert damit jede
// Tabelle auf die Org — auch wenn der Fachcode den Filter vergisst, liefert
// die DB 0 Zeilen statt Fremddaten. Nach dem Commit ist der Kontext weg,
// Pool-Verbindungen tragen nichts weiter.

export type OrgCtx = {
	orgId: string;
	userId: string | null;
	ip?: string | null;
	userAgent?: string | null;
	requestId?: string;
};

export type OrgTx = DbTx;

// Enterprise-Option: dbForOrg() liefert die Org-eigene Datenbank, wenn
// ORG_DATABASE_URLS sie kennt — sonst globalDb (lib/db/router.ts).
export async function withOrg<T>(
	ctx: OrgCtx,
	fn: (tx: OrgTx) => Promise<T>,
): Promise<T> {
	return dbForOrg(ctx.orgId).transaction(async (tx) => {
		await tx.execute(sql`select set_config('app.org_id', ${ctx.orgId}, true)`);
		return fn(tx);
	});
}

// Lesende Variante: zusätzlich READ ONLY — ein versehentliches Schreiben
// in einer Server-Component-Query bricht hart ab.
export async function readOrg<T>(
	ctx: OrgCtx,
	fn: (tx: OrgTx) => Promise<T>,
): Promise<T> {
	return dbForOrg(ctx.orgId).transaction(async (tx) => {
		await tx.execute(sql`set transaction read only`);
		await tx.execute(sql`select set_config('app.org_id', ${ctx.orgId}, true)`);
		return fn(tx);
	});
}

// Mutation + Audit atomar: fn liefert Ergebnis und Audit-Eintrag; der Eintrag
// wird als letzte Anweisung derselben Transaktion geschrieben.
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
		for (const entry of Array.isArray(entries) ? entries : [entries]) {
			await audit(tx, actor, { ...entry, organizationId: ctx.orgId });
		}
		return result;
	});
}

export type PlatformCtx = {
	userId: string | null;
	reason: string;
	ip?: string | null;
	userAgent?: string | null;
};

// Plattform-Zugriff über alle Mandanten (Admin, Jobs, Migrations-Skripte).
// Der Zugriff wird VOR der Arbeit mit Begründung auditiert — in einer eigenen,
// committeten Transaktion, damit auch ein Fehlschlag Spuren hinterlässt.
export async function withPlatform<T>(
	ctx: PlatformCtx,
	fn: (tx: OrgTx) => Promise<T>,
): Promise<T> {
	if (!ctx.reason || ctx.reason.trim().length < 3) {
		throw new Error("withPlatform verlangt eine Begründung (reason)");
	}
	await globalDb.transaction(async (tx) => {
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
	return globalDb.transaction(async (tx) => {
		await tx.execute(sql`select set_config('app.scope', 'platform', true)`);
		return fn(tx);
	});
}

// Für Jobs: eine Org nach der anderen, jede in eigenem Kontext.
export async function forEachOrg(
	orgIds: readonly string[],
	fn: (tx: OrgTx, orgId: string) => Promise<void>,
): Promise<void> {
	for (const orgId of orgIds) {
		await withOrg({ orgId, userId: null }, (tx) => fn(tx, orgId));
	}
}
