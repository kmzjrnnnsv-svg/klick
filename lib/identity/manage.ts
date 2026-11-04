import { and, eq } from "drizzle-orm";
import { member } from "@/db/auth-schema";
import {
	identityAccounts,
	identityExceptions,
	identitySources,
	orgSettings,
} from "@/db/schema";
import type { AuditInput } from "@/lib/audit";
import type { OrgTx } from "@/lib/db/with-org";
import { matchAccounts } from "./match";
import type { IdentityPolicy } from "./policy";
import { exceptionError } from "./rules";
import { evaluateIdentityChecks, syncContext } from "./service";
import type { ExceptionKind } from "./types";

// Identität anbinden (Teil D, I1b): Änderungen aus /team/konten — Ausnahmen,
// Zuordnung zu Personen, „ausgeschieden“. Danach werden die Prüfungen neu
// gerechnet (gleiche Regeln wie beim Abruf). Audit nur mit Kennungen, nie
// Namen, Adressen oder Begründungstexte.

export type ManageResult =
	| { ok: true; audit: AuditInput[] }
	| { ok: false; error: string };

const today = (now: Date) => now.toISOString().slice(0, 10);

async function accountOf(tx: OrgTx, orgId: string, accountId: string) {
	const [row] = await tx
		.select({
			id: identityAccounts.id,
			sourceId: identityAccounts.sourceId,
			isAdmin: identityAccounts.isAdmin,
			isTopAdmin: identityAccounts.isTopAdmin,
			matchedUserId: identityAccounts.matchedUserId,
			markedLeftAt: identityAccounts.markedLeftAt,
		})
		.from(identityAccounts)
		.where(
			and(
				eq(identityAccounts.organizationId, orgId),
				eq(identityAccounts.id, accountId),
			),
		)
		.limit(1);
	return row ?? null;
}

async function recheck(
	tx: OrgTx,
	ctx: { orgId: string },
	now: Date,
	audit: AuditInput,
): Promise<ManageResult> {
	return {
		ok: true,
		audit: [audit, ...(await evaluateIdentityChecks(tx, ctx, now))],
	};
}

// Ausnahme für ein Konto (Notfall-, Dienst-, sonstiges Konto): Begründung
// Pflicht, befristet (Admins kürzer), nie für das eigene Konto
export async function addIdentityException(
	tx: OrgTx,
	ctx: { orgId: string; userId: string },
	input: {
		accountId: string;
		kind: ExceptionKind;
		reason: string;
		expiresAt: string;
		now: Date;
	},
): Promise<ManageResult> {
	const account = await accountOf(tx, ctx.orgId, input.accountId);
	if (!account) return { ok: false, error: "notFound" };
	const err = exceptionError({
		kind: input.kind,
		reason: input.reason,
		expiresAt: input.expiresAt,
		isAdmin: account.isAdmin || account.isTopAdmin,
		ownAccount: account.matchedUserId === ctx.userId,
		today: today(input.now),
	});
	if (err) return { ok: false, error: `identity_${err}` };
	const [row] = await tx
		.insert(identityExceptions)
		.values({
			organizationId: ctx.orgId,
			accountId: account.id,
			kind: input.kind,
			reason: input.reason.trim().slice(0, 1000),
			expiresAt: input.expiresAt,
			createdBy: ctx.userId,
		})
		.returning({ id: identityExceptions.id });
	return recheck(tx, ctx, input.now, {
		action: "identity.exception_added",
		target: `identity_account:${account.id}`,
		after: {
			exception: row?.id,
			kind: input.kind,
			expiresAt: input.expiresAt,
		},
	});
}

export async function revokeIdentityException(
	tx: OrgTx,
	ctx: { orgId: string; userId: string },
	input: { exceptionId: string; now: Date },
): Promise<ManageResult> {
	const [row] = await tx
		.update(identityExceptions)
		.set({ revokedAt: input.now, revokedBy: ctx.userId })
		.where(
			and(
				eq(identityExceptions.organizationId, ctx.orgId),
				eq(identityExceptions.id, input.exceptionId),
			),
		)
		.returning({
			accountId: identityExceptions.accountId,
			revokedAt: identityExceptions.revokedAt,
		});
	if (!row) return { ok: false, error: "notFound" };
	return recheck(tx, ctx, input.now, {
		action: "identity.exception_revoked",
		target: `identity_account:${row.accountId}`,
		after: { exception: input.exceptionId },
	});
}

// Zuordnung von Hand: eine Person der Org, „niemand“ (bleibt so, auch beim
// Abruf) oder zurück zur automatischen Zuordnung
export async function setIdentityAccountMatch(
	tx: OrgTx,
	ctx: { orgId: string; userId: string },
	input: { accountId: string; match: "auto" | "none" | string; now: Date },
): Promise<ManageResult> {
	const account = await accountOf(tx, ctx.orgId, input.accountId);
	if (!account) return { ok: false, error: "notFound" };
	let matchedUserId: string | null = null;
	let matchMode: "auto" | "manual" = "manual";
	if (input.match === "auto") {
		matchMode = "auto";
		const sc = await syncContext(tx, ctx.orgId, account.sourceId);
		const accounts = await tx
			.select({
				id: identityAccounts.id,
				email: identityAccounts.email,
				kind: identityAccounts.kind,
				matchMode: identityAccounts.matchMode,
				matchedUserId: identityAccounts.matchedUserId,
			})
			.from(identityAccounts)
			.where(
				and(
					eq(identityAccounts.organizationId, ctx.orgId),
					eq(identityAccounts.sourceId, account.sourceId),
				),
			);
		const matched = matchAccounts({
			accounts: accounts.map((a) =>
				a.id === account.id ? { ...a, matchMode: "auto" as const } : a,
			),
			people: sc?.members ?? [],
			verifiedDomains: sc?.source.domains ?? [],
		});
		matchedUserId = matched.get(account.id) ?? null;
	} else if (input.match !== "none") {
		const [m] = await tx
			.select({ userId: member.userId })
			.from(member)
			.where(
				and(
					eq(member.organizationId, ctx.orgId),
					eq(member.userId, input.match),
				),
			)
			.limit(1);
		if (!m) return { ok: false, error: "identity_not_member" };
		matchedUserId = m.userId;
	}
	await tx
		.update(identityAccounts)
		.set({ matchedUserId, matchMode })
		.where(eq(identityAccounts.id, account.id));
	return recheck(tx, ctx, input.now, {
		action: "identity.account_matched",
		target: `identity_account:${account.id}`,
		before: { user: account.matchedUserId },
		after: {
			user: matchedUserId,
			mode: input.match === "auto" ? "auto" : "manual",
		},
	});
}

// In Klick als ausgeschieden markieren (bzw. zurücknehmen): ist das Konto
// nach der Frist noch aktiv, schlägt die Prüfung „Austritte“ an
export async function setIdentityAccountLeft(
	tx: OrgTx,
	ctx: { orgId: string; userId: string },
	input: { accountId: string; left: boolean; now: Date },
): Promise<ManageResult> {
	const account = await accountOf(tx, ctx.orgId, input.accountId);
	if (!account) return { ok: false, error: "notFound" };
	if (input.left === (account.markedLeftAt !== null))
		return { ok: true, audit: [] };
	await tx
		.update(identityAccounts)
		.set(
			input.left
				? { markedLeftAt: input.now, markedLeftBy: ctx.userId }
				: { markedLeftAt: null, markedLeftBy: null },
		)
		.where(eq(identityAccounts.id, account.id));
	return recheck(tx, ctx, input.now, {
		action: input.left
			? "identity.account_marked_left"
			: "identity.account_unmarked_left",
		target: `identity_account:${account.id}`,
	});
}

// Strengere Schwellen wirken sofort (Lockern läuft über Vier-Augen, Art
// identity_policy, in der Action)
export async function writeIdentityPolicy(
	tx: OrgTx,
	ctx: { orgId: string },
	input: { before: unknown; next: IdentityPolicy; now: Date },
): Promise<AuditInput[]> {
	const { staleHours: _fixed, ...stored } = input.next;
	await tx
		.update(orgSettings)
		.set({ identityPolicy: stored })
		.where(eq(orgSettings.organizationId, ctx.orgId));
	const audits: AuditInput[] = [
		{
			action: "settings.identity_policy",
			target: `organization:${ctx.orgId}`,
			before: (input.before ?? null) as Record<string, unknown> | null,
			after: stored,
		},
	];
	// nur mit Quelle: ohne Abruf gibt es nichts neu zu rechnen
	const [source] = await tx
		.select({ id: identitySources.id })
		.from(identitySources)
		.where(eq(identitySources.organizationId, ctx.orgId))
		.limit(1);
	if (source)
		audits.push(...(await evaluateIdentityChecks(tx, ctx, input.now)));
	return audits;
}
