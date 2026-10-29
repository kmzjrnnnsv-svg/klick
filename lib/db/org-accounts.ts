import { and, eq, sql } from "drizzle-orm";
import { type DbTx, globalDb } from "@/db";
import { member, user } from "@/db/auth-schema";
import {
	type PlatformOrgAccount,
	platformOrgAccounts,
} from "@/db/schema/org-accounts";
import { type Actor, audit } from "@/lib/audit";

// Vertrag und Sperre je Organisation (Admin-Portal, Teil 2). Plattform-
// Tabelle ohne RLS: nur hier gelesen und geschrieben. Die Sperre steht
// zusätzlich in der Kette der Org (org.suspended / org.resumed), damit die
// Org sieht, wann und warum sie gesperrt war.

async function platformTx<T>(fn: (tx: DbTx) => Promise<T>): Promise<T> {
	return globalDb.transaction(async (tx) => {
		await tx.execute(sql`select set_config('app.scope', 'platform', true)`);
		return fn(tx);
	});
}

export async function orgAccount(
	orgId: string,
): Promise<PlatformOrgAccount | null> {
	const [row] = await globalDb
		.select()
		.from(platformOrgAccounts)
		.where(eq(platformOrgAccounts.orgId, orgId))
		.limit(1);
	return row ?? null;
}

export async function orgAccounts(): Promise<Map<string, PlatformOrgAccount>> {
	const rows = await globalDb.select().from(platformOrgAccounts);
	return new Map(rows.map((r) => [r.orgId, r]));
}

/** Nur die Sperre, für die Guards (lib/org/suspension.ts). */
export async function orgSuspensionRow(
	orgId: string,
): Promise<{ suspendedAt: Date | null; suspendedReason: string | null }> {
	const [row] = await globalDb
		.select({
			suspendedAt: platformOrgAccounts.suspendedAt,
			suspendedReason: platformOrgAccounts.suspendedReason,
		})
		.from(platformOrgAccounts)
		.where(eq(platformOrgAccounts.orgId, orgId))
		.limit(1);
	return row ?? { suspendedAt: null, suspendedReason: null };
}

export type AccountPatch = Partial<
	Pick<
		PlatformOrgAccount,
		| "status"
		| "startedAt"
		| "auditPassedAt"
		| "feeInvoicedFor"
		| "cancelledAt"
		| "note"
	>
>;

// Vertragsdaten ändern (Plattform-Protokoll mit vorher/nachher; die Notiz
// selbst steht nicht im Protokoll, nur dass sie sich geändert hat).
export async function saveOrgAccount(
	actor: Actor & { userId: string },
	orgId: string,
	patch: AccountPatch,
): Promise<void> {
	await platformTx(async (tx) => {
		const [before] = await tx
			.select()
			.from(platformOrgAccounts)
			.where(eq(platformOrgAccounts.orgId, orgId))
			.for("update");
		const values = { ...patch, updatedAt: new Date(), updatedBy: actor.userId };
		await tx
			.insert(platformOrgAccounts)
			.values({ orgId, ...values })
			.onConflictDoUpdate({ target: platformOrgAccounts.orgId, set: values });
		const strip = (r: Partial<PlatformOrgAccount> | undefined) => {
			if (!r) return null;
			const { note: _n, updatedAt: _u, updatedBy: _b, ...rest } = r;
			return rest;
		};
		await audit(tx, actor, {
			action: "org.account_updated",
			target: `organization:${orgId}`,
			before: strip(before),
			after: {
				...strip({ ...before, ...patch }),
				noteChanged:
					patch.note !== undefined && patch.note !== (before?.note ?? null),
			},
		});
	});
}

export type OwnerContact = { email: string; name: string };

async function ownersOf(tx: DbTx, orgId: string): Promise<OwnerContact[]> {
	return tx
		.select({ email: user.email, name: user.name })
		.from(member)
		.innerJoin(user, eq(user.id, member.userId))
		.where(and(eq(member.organizationId, orgId), eq(member.role, "owner")));
}

// Sperren bzw. entsperren: Plattform-Tabelle, Kette der Org und Plattform-
// Kette in einer Transaktion. Gibt die Inhaber:innen für die Mitteilung zurück.
export async function setOrgSuspension(
	actor: Actor & { userId: string },
	orgId: string,
	input: { suspend: true; reason: string } | { suspend: false },
): Promise<{ changed: boolean; owners: OwnerContact[] }> {
	return platformTx(async (tx) => {
		const [before] = await tx
			.select()
			.from(platformOrgAccounts)
			.where(eq(platformOrgAccounts.orgId, orgId))
			.for("update");
		const was = Boolean(before?.suspendedAt);
		if (was === input.suspend) return { changed: false, owners: [] };
		const values = input.suspend
			? {
					suspendedAt: new Date(),
					suspendedReason: input.reason,
					suspendedBy: actor.userId,
				}
			: { suspendedAt: null, suspendedReason: null, suspendedBy: null };
		await tx
			.insert(platformOrgAccounts)
			.values({ orgId, ...values, updatedBy: actor.userId })
			.onConflictDoUpdate({
				target: platformOrgAccounts.orgId,
				set: { ...values, updatedAt: new Date(), updatedBy: actor.userId },
			});
		const action = input.suspend ? "org.suspended" : "org.resumed";
		const detail = input.suspend
			? { reason: input.reason }
			: { since: before?.suspendedAt?.toISOString() ?? null };
		// Kette der Org: sie soll sehen, dass und warum sie gesperrt war
		await audit(tx, actor, {
			action,
			organizationId: orgId,
			target: `organization:${orgId}`,
			after: { ...detail, via: "platform" },
		});
		await audit(tx, actor, {
			action,
			target: `organization:${orgId}`,
			after: detail,
		});
		return { changed: true, owners: await ownersOf(tx, orgId) };
	});
}

export type OrgAiSettings = Pick<
	PlatformOrgAccount,
	"aiEnabled" | "aiMode" | "aiMaxClass"
>;

/** Freischaltung der KI für die Org (lib/ai/policy.ts aiAdminOf). */
export async function orgAiRow(orgId: string): Promise<OrgAiSettings | null> {
	const [row] = await globalDb
		.select({
			aiEnabled: platformOrgAccounts.aiEnabled,
			aiMode: platformOrgAccounts.aiMode,
			aiMaxClass: platformOrgAccounts.aiMaxClass,
		})
		.from(platformOrgAccounts)
		.where(eq(platformOrgAccounts.orgId, orgId))
		.limit(1);
	return row ?? null;
}

// KI freischalten, Modus und Obergrenze (ADR-032): Plattform-Tabelle,
// Plattform-Kette und Kette der Org in einer Transaktion — die Inhaber:innen
// sehen im Verlauf, wann Klick die KI für sie freigeschaltet hat.
export async function setOrgAi(
	actor: Actor & { userId: string },
	orgId: string,
	next: OrgAiSettings,
): Promise<{ changed: boolean; owners: OwnerContact[] }> {
	return platformTx(async (tx) => {
		const [before] = await tx
			.select({
				aiEnabled: platformOrgAccounts.aiEnabled,
				aiMode: platformOrgAccounts.aiMode,
				aiMaxClass: platformOrgAccounts.aiMaxClass,
			})
			.from(platformOrgAccounts)
			.where(eq(platformOrgAccounts.orgId, orgId))
			.for("update");
		const was: OrgAiSettings = before ?? {
			aiEnabled: false,
			aiMode: "assist",
			aiMaxClass: "none",
		};
		if (
			was.aiEnabled === next.aiEnabled &&
			was.aiMode === next.aiMode &&
			was.aiMaxClass === next.aiMaxClass
		)
			return { changed: false, owners: [] };
		await tx
			.insert(platformOrgAccounts)
			.values({ orgId, ...next, updatedBy: actor.userId })
			.onConflictDoUpdate({
				target: platformOrgAccounts.orgId,
				set: { ...next, updatedAt: new Date(), updatedBy: actor.userId },
			});
		await audit(tx, actor, {
			action: "platform.ai_settings",
			organizationId: orgId,
			target: `organization:${orgId}`,
			before: was,
			after: { ...next, via: "platform" },
		});
		await audit(tx, actor, {
			action: "platform.ai_settings",
			target: `organization:${orgId}`,
			before: was,
			after: next,
		});
		return { changed: true, owners: await ownersOf(tx, orgId) };
	});
}
