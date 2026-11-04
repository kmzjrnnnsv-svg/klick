import { and, eq, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { member, user } from "@/db/auth-schema";
import {
	accessReviewItems,
	accessReviews,
	controlImplementations,
	controls,
	controlTests,
	type IdentitySource,
	identityAccounts,
	identityCheckResults,
	identityExceptions,
	identitySources,
	nonconformities,
	orgSettings,
} from "@/db/schema";
import type { AuditInput } from "@/lib/audit";
import { insertControlTest } from "@/lib/compliance/control-test-service";
import { isUniqueViolation } from "@/lib/db/errors";
import type { OrgTx } from "@/lib/db/with-org";
import { nonceHash } from "@/lib/microsoft/consent";
import { matchAccounts } from "./match";
import { identityPolicyOf } from "./policy";
import {
	activeException,
	nonconformityDue,
	runIdentityChecks,
	testDue,
} from "./rules";
import type {
	CheckOutcome,
	IdentityCheckKey,
	IdentityProvider,
	ProviderSnapshot,
} from "./types";

// Identität anbinden (Teil D): Schreiben nur hier. Netzaufrufe laufen nie in
// einer offenen Transaktion — der Abruf (lib/identity/sync.ts) liest, ruft
// den Anbieter und schreibt danach kurz. Audit nur mit Kennungen und Zahlen,
// nie Namen, Adressen oder Rollen einzelner Konten.

export const CONSENT_TTL_MS = 60 * 60 * 1000;
// verschwundene Konten bleiben 30 Tage sichtbar, dann weg
export const MISSING_KEEP_DAYS = 30;
const DAY = 86_400_000;

export async function identitySourcesOf(
	tx: OrgTx,
	orgId: string,
): Promise<IdentitySource[]> {
	return tx
		.select()
		.from(identitySources)
		.where(eq(identitySources.organizationId, orgId));
}

export async function identitySourceOf(
	tx: OrgTx,
	orgId: string,
	provider: IdentityProvider,
): Promise<IdentitySource | null> {
	const [row] = await tx
		.select()
		.from(identitySources)
		.where(
			and(
				eq(identitySources.organizationId, orgId),
				eq(identitySources.provider, provider),
			),
		)
		.limit(1);
	return row ?? null;
}

// ── Entra ID: Freigabe im Tenant der Kundin ────────────────────────────

// Freigabe-Link vorbereiten: Tenant (ID oder Domain) merken, Einmalwert nur
// als SHA-256. Eine bestehende aktive Verbindung bleibt, bis der Rückruf sie
// ersetzt; ein offener Antrag wird überschrieben.
export async function prepareEntraConsent(
	tx: OrgTx,
	ctx: { orgId: string; userId: string | null },
	input: { tenant: string; nonce: string; now: Date },
): Promise<{ expiresAt: Date; audit: AuditInput }> {
	const expiresAt = new Date(input.now.getTime() + CONSENT_TTL_MS);
	const tenant = input.tenant.trim().toLowerCase();
	const existing = await identitySourceOf(tx, ctx.orgId, "entra");
	if (existing)
		await tx
			.update(identitySources)
			.set({
				...(existing.status === "pending_consent" ? { tenantKey: tenant } : {}),
				consentNonceHash: nonceHash(input.nonce),
				consentExpiresAt: expiresAt,
				updatedAt: input.now,
			})
			.where(eq(identitySources.id, existing.id));
	else
		await tx.insert(identitySources).values({
			organizationId: ctx.orgId,
			provider: "entra",
			tenantKey: tenant,
			status: "pending_consent",
			consentNonceHash: nonceHash(input.nonce),
			consentExpiresAt: expiresAt,
			createdBy: ctx.userId,
		});
	return {
		expiresAt,
		audit: {
			action: "identity.consent_started",
			target: `organization:${ctx.orgId}`,
			after: { provider: "entra", tenant },
		},
	};
}

export type IdentityConsentResult =
	| "active"
	| "denied"
	| "invalid"
	| "unbound"
	| "taken";

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Rückruf von Microsoft: nur mit passendem Einmalwert, vor Ablauf; Microsoft
// meldet die Tenant-ID. War eine ID gemerkt, muss sie passen; war eine Domain
// gemerkt, entscheidet die Bindung (eine Inhaber:in im Tenant) (pure).
export function entraCallbackValid(
	row: Pick<
		IdentitySource,
		"consentNonceHash" | "consentExpiresAt" | "tenantKey"
	> | null,
	input: { nonce: string; tenantId: string | null; now: Date },
): boolean {
	if (
		!row?.consentNonceHash ||
		row.consentNonceHash !== nonceHash(input.nonce) ||
		!row.consentExpiresAt ||
		row.consentExpiresAt < input.now
	)
		return false;
	if (input.tenantId !== null && !GUID.test(input.tenantId)) return false;
	return (
		input.tenantId === null ||
		!GUID.test(row.tenantKey) ||
		input.tenantId.toLowerCase() === row.tenantKey.toLowerCase()
	);
}

export async function consentContext(
	tx: OrgTx,
	orgId: string,
): Promise<{ row: IdentitySource | null; ownerEmails: string[] }> {
	const row = await identitySourceOf(tx, orgId, "entra");
	const owners = await tx
		.select({ email: user.email })
		.from(member)
		.innerJoin(user, eq(user.id, member.userId))
		.where(and(eq(member.organizationId, orgId), eq(member.role, "owner")));
	return { row, ownerEmails: owners.map((o) => o.email) };
}

// Rückruf abschließen. `bound` kommt aus entraBound (Netz, vorher); ein
// Tenant gehört nur einer Org (Index identity_sources_tenant_uq).
export async function completeEntraConsent(
	tx: OrgTx,
	input: {
		orgId: string;
		nonce: string;
		tenantId: string | null;
		granted: boolean;
		bound: boolean;
		error: string | null;
		now: Date;
	},
): Promise<{ result: IdentityConsentResult; audit: AuditInput[] }> {
	const row = await identitySourceOf(tx, input.orgId, "entra");
	if (!row || !entraCallbackValid(row, input))
		return { result: "invalid", audit: [] };
	const target = `organization:${input.orgId}`;
	const clear = {
		consentNonceHash: null,
		consentExpiresAt: null,
		updatedAt: input.now,
	};
	const fail = async (result: IdentityConsentResult, lastError: string) => {
		await tx
			.update(identitySources)
			.set({
				...clear,
				lastError: lastError.slice(0, 120),
				lastErrorAt: input.now,
			})
			.where(eq(identitySources.id, row.id));
		return {
			result,
			audit: [
				{
					action: `identity.consent_${result}`,
					target,
					after: { provider: "entra" },
					outcome: "failure" as const,
				},
			],
		};
	};
	if (!input.granted || input.error)
		return fail("denied", input.error ?? "denied");
	if (!input.tenantId) return fail("invalid", "tenant_missing");
	if (!input.bound) return fail("unbound", "tenant_unbound");
	const tenantKey = input.tenantId.toLowerCase();
	// Gehört der Tenant schon einer anderen Org? Die sieht RLS nicht; der
	// Index identity_sources_tenant_uq entscheidet, im Sicherungspunkt.
	try {
		await tx.transaction((sp) =>
			sp
				.update(identitySources)
				.set({
					...clear,
					tenantKey,
					status: "active",
					connectedAt: row.connectedAt ?? input.now,
					lastError: null,
					lastErrorAt: null,
				})
				.where(eq(identitySources.id, row.id)),
		);
	} catch (e) {
		if (!isUniqueViolation(e)) throw e;
		return fail("taken", "tenant_taken");
	}
	return {
		result: "active",
		audit: [
			{
				action: "identity.connected",
				target,
				before: { status: row.status },
				after: { provider: "entra", tenant: tenantKey },
			},
		],
	};
}

// ── Abruf: Stand schreiben ─────────────────────────────────────────────

export type SyncContext = {
	source: IdentitySource;
	members: { userId: string; email: string }[];
};

export async function syncContext(
	tx: OrgTx,
	orgId: string,
	sourceId: string,
): Promise<SyncContext | null> {
	const [source] = await tx
		.select()
		.from(identitySources)
		.where(
			and(
				eq(identitySources.id, sourceId),
				eq(identitySources.organizationId, orgId),
			),
		)
		.limit(1);
	if (!source) return null;
	return { source, members: await memberEmails(tx, orgId) };
}

async function memberEmails(
	tx: OrgTx,
	orgId: string,
): Promise<{ userId: string; email: string }[]> {
	const rows = await tx
		.select({ userId: user.id, email: user.email })
		.from(member)
		.innerJoin(user, eq(user.id, member.userId))
		.where(eq(member.organizationId, orgId));
	return rows.map((r) => ({ userId: r.userId, email: r.email.toLowerCase() }));
}

export async function recordSyncError(
	tx: OrgTx,
	ctx: { orgId: string },
	source: Pick<IdentitySource, "id" | "provider">,
	error: string,
	now: Date,
): Promise<AuditInput> {
	await tx
		.update(identitySources)
		.set({
			lastSyncOk: false,
			lastError: error.slice(0, 120),
			lastErrorAt: now,
			updatedAt: now,
			// fehlende Freigabe: Verbindung bleibt, zeigt aber den Fehler
			...(error === "consent_missing" ? { status: "error" as const } : {}),
		})
		.where(eq(identitySources.id, source.id));
	return {
		action: "identity.sync_failed",
		target: `organization:${ctx.orgId}`,
		after: { provider: source.provider, error },
		outcome: "failure",
	};
}

// Stand des Anbieters übernehmen: Konten anlegen oder aktualisieren,
// verschwundene markieren (nach 30 Tagen löschen), Personen zuordnen und
// Personen, die Klick verlassen haben, als ausgeschieden vermerken.
export async function applySnapshot(
	tx: OrgTx,
	ctx: { orgId: string },
	input: {
		source: IdentitySource;
		members: { userId: string; email: string }[];
		snapshot: ProviderSnapshot;
		now: Date;
	},
): Promise<AuditInput> {
	const { source, snapshot, now } = input;
	const existing = await tx
		.select({
			id: identityAccounts.id,
			externalId: identityAccounts.externalId,
			matchMode: identityAccounts.matchMode,
			matchedUserId: identityAccounts.matchedUserId,
			markedLeftAt: identityAccounts.markedLeftAt,
		})
		.from(identityAccounts)
		.where(
			and(
				eq(identityAccounts.organizationId, ctx.orgId),
				eq(identityAccounts.sourceId, source.id),
			),
		);
	const byExt = new Map(existing.map((e) => [e.externalId, e]));
	const seen = new Set<string>();
	let created = 0;
	for (const a of snapshot.accounts) {
		seen.add(a.externalId);
		const values = {
			email: a.email,
			displayName: a.displayName.slice(0, 200),
			kind: a.kind,
			enabled: a.enabled,
			isAdmin: a.isAdmin,
			isTopAdmin: a.isTopAdmin,
			adminRoles: a.adminRoles.slice(0, 10),
			mfaRegistered: a.mfaRegistered,
			lastSignInAt: a.lastSignInAt ? new Date(a.lastSignInAt) : null,
			createdAtSource: a.createdAt ? new Date(a.createdAt) : null,
			leaveAt: a.leaveAt ? new Date(a.leaveAt) : null,
			lastSeenAt: now,
			missingSince: null,
		};
		const prev = byExt.get(a.externalId);
		if (prev)
			await tx
				.update(identityAccounts)
				.set(values)
				.where(eq(identityAccounts.id, prev.id));
		else {
			created += 1;
			await tx.insert(identityAccounts).values({
				organizationId: ctx.orgId,
				sourceId: source.id,
				externalId: a.externalId,
				firstSeenAt: now,
				...values,
			});
		}
	}
	const gone = existing.filter((e) => !seen.has(e.externalId)).map((e) => e.id);
	if (gone.length > 0)
		await tx
			.update(identityAccounts)
			.set({ missingSince: now })
			.where(
				and(
					inArray(identityAccounts.id, gone),
					isNull(identityAccounts.missingSince),
				),
			);
	const deleted = await tx
		.delete(identityAccounts)
		.where(
			and(
				eq(identityAccounts.organizationId, ctx.orgId),
				eq(identityAccounts.sourceId, source.id),
				lt(
					identityAccounts.missingSince,
					new Date(now.getTime() - MISSING_KEEP_DAYS * DAY),
				),
			),
		)
		.returning({ id: identityAccounts.id });

	// Personen, die Klick verlassen haben: ausgeschieden vermerken (zuerst,
	// damit die neue Zuordnung den Bezug nicht verliert)
	const memberIds = new Set(input.members.map((m) => m.userId));
	await tx
		.update(identityAccounts)
		.set({ markedLeftAt: now })
		.where(
			and(
				eq(identityAccounts.organizationId, ctx.orgId),
				eq(identityAccounts.sourceId, source.id),
				isNotNull(identityAccounts.matchedUserId),
				isNull(identityAccounts.markedLeftAt),
				memberIds.size > 0
					? sql`${identityAccounts.matchedUserId} not in (${sql.join(
							[...memberIds].map((id) => sql`${id}`),
							sql`, `,
						)})`
					: sql`true`,
			),
		);

	// Zuordnung neu rechnen (von Hand gesetzte bleiben)
	const current = await tx
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
				eq(identityAccounts.sourceId, source.id),
			),
		);
	const matched = matchAccounts({
		accounts: current,
		people: input.members,
		verifiedDomains: snapshot.domains,
	});
	for (const c of current) {
		const next = matched.get(c.id) ?? null;
		if (next !== c.matchedUserId)
			await tx
				.update(identityAccounts)
				.set({ matchedUserId: next })
				.where(eq(identityAccounts.id, c.id));
	}

	await tx
		.update(identitySources)
		.set({
			lastSyncAt: now,
			lastSyncOk: true,
			accountCount: snapshot.accounts.length,
			capabilities: snapshot.capabilities,
			domains: snapshot.domains.slice(0, 50),
			lastError: null,
			lastErrorAt: null,
			status: "active",
			updatedAt: now,
		})
		.where(eq(identitySources.id, source.id));
	return {
		action: "identity.synced",
		target: `organization:${ctx.orgId}`,
		after: {
			provider: source.provider,
			accounts: snapshot.accounts.length,
			created,
			missing: gone.length,
			deleted: deleted.length,
			capabilities: snapshot.capabilities,
		},
	};
}

// ── Prüfungen fortschreiben ────────────────────────────────────────────

const today = (now: Date) => now.toISOString().slice(0, 10);

// Prüfungen über alle Quellen der Org rechnen, Ergebnis je Prüfung merken
// und den Test im Testprogramm schreiben, wenn er fällig ist (erster Lauf,
// Wechsel, monatlich). Eine Abweichung entsteht nur bei fail nach der
// Einrichtungsfrist von 7 Tagen und nur, wenn keine offen ist.
export async function evaluateIdentityChecks(
	tx: OrgTx,
	ctx: { orgId: string },
	now: Date,
): Promise<AuditInput[]> {
	const sources = (await identitySourcesOf(tx, ctx.orgId)).filter(
		(s) => s.status !== "pending_consent",
	);
	const [settings] = await tx
		.select({ policy: orgSettings.identityPolicy })
		.from(orgSettings)
		.where(eq(orgSettings.organizationId, ctx.orgId));
	const policy = identityPolicyOf(settings?.policy);
	const accounts = await tx
		.select()
		.from(identityAccounts)
		.where(
			and(
				eq(identityAccounts.organizationId, ctx.orgId),
				isNull(identityAccounts.missingSince),
			),
		);
	const exceptions = await tx
		.select()
		.from(identityExceptions)
		.where(eq(identityExceptions.organizationId, ctx.orgId));
	const excByAccount = new Map<string, typeof exceptions>();
	for (const e of exceptions) {
		const list = excByAccount.get(e.accountId) ?? [];
		list.push(e);
		excByAccount.set(e.accountId, list);
	}
	const revoked = await tx
		.select({
			accountId: accessReviewItems.accountId,
			decidedAt: accessReviewItems.decidedAt,
		})
		.from(accessReviewItems)
		.where(
			and(
				eq(accessReviewItems.organizationId, ctx.orgId),
				eq(accessReviewItems.decision, "revoke"),
				isNotNull(accessReviewItems.accountId),
			),
		);
	const [lastReview] = await tx
		.select({ closedAt: sql<Date | null>`max(${accessReviews.closedAt})` })
		.from(accessReviews)
		.where(
			and(
				eq(accessReviews.organizationId, ctx.orgId),
				eq(accessReviews.status, "closed"),
			),
		);
	// mehrere Quellen: die älteste zählt, Fähigkeiten nur, wo alle sie haben
	const synced = sources.map((s) => s.lastSyncAt).filter(Boolean) as Date[];
	const syncedAt =
		sources.length === 0 || synced.length < sources.length
			? null
			: new Date(Math.min(...synced.map((d) => d.getTime())));
	const caps = sources.map((s) => s.capabilities);
	const all = (k: "signIn" | "mfa" | "roles" | "leaveDate") =>
		caps.length > 0 && caps.every((c) => c?.[k] === true);
	const results = runIdentityChecks({
		now,
		syncedAt,
		capabilities: {
			signIn: all("signIn"),
			mfa: all("mfa"),
			roles: all("roles"),
			leaveDate: all("leaveDate"),
		},
		policy,
		accounts: accounts.map((a) => {
			const exc = activeException(
				(excByAccount.get(a.id) ?? []).map((e) => ({
					kind: e.kind,
					expiresAt: e.expiresAt,
					revokedAt: e.revokedAt ? e.revokedAt.toISOString() : null,
				})),
				today(now),
			);
			return {
				id: a.id,
				externalId: a.externalId,
				email: a.email,
				displayName: a.displayName,
				kind: a.kind,
				enabled: a.enabled,
				isAdmin: a.isAdmin,
				isTopAdmin: a.isTopAdmin,
				adminRoles: a.adminRoles,
				mfaRegistered: a.mfaRegistered,
				lastSignInAt: a.lastSignInAt?.toISOString() ?? null,
				createdAt: a.createdAtSource?.toISOString() ?? null,
				leaveAt: a.leaveAt?.toISOString() ?? null,
				matchedUserId: a.matchedUserId,
				markedLeftAt: a.markedLeftAt?.toISOString() ?? null,
				exception: exc ? { kind: exc.kind, expiresAt: exc.expiresAt } : null,
			};
		}),
		removedUsers: new Map(),
		revokedAccounts: new Map(
			revoked
				.filter((r) => r.accountId && r.decidedAt)
				.map((r) => [
					r.accountId as string,
					(r.decidedAt as Date).toISOString(),
				]),
		),
		lastReviewClosedAt: lastReview?.closedAt
			? new Date(lastReview.closedAt).toISOString()
			: null,
	});
	const connectedAt = sources
		.map((s) => s.connectedAt)
		.filter(Boolean)
		.sort((a, b) => (a as Date).getTime() - (b as Date).getTime())[0] as
		| Date
		| undefined;
	const audits: AuditInput[] = [];
	for (const r of results) {
		const audit = await writeCheckResult(tx, ctx, {
			key: r.key,
			controlCode: r.controlCode,
			result: r.result,
			reasons: r.reasons,
			affected: r.affected,
			now,
			connectedAt: connectedAt ?? null,
		});
		audits.push(...audit);
	}
	return audits;
}

async function writeCheckResult(
	tx: OrgTx,
	ctx: { orgId: string },
	r: {
		key: IdentityCheckKey;
		controlCode: string;
		result: CheckOutcome;
		reasons: { code: string; count?: number; value?: number; limit?: number }[];
		affected: string[];
		now: Date;
		connectedAt: Date | null;
	},
): Promise<AuditInput[]> {
	const [prev] = await tx
		.select()
		.from(identityCheckResults)
		.where(
			and(
				eq(identityCheckResults.organizationId, ctx.orgId),
				eq(identityCheckResults.checkKey, r.key),
			),
		)
		.limit(1);
	let lastTestAt = prev?.lastTestAt ?? null;
	let lastTestResult = prev?.lastTestResult ?? null;
	let lastTestId = prev?.lastTestId ?? null;
	const audits: AuditInput[] = [];
	const due = testDue({
		result: r.result,
		lastTestResult,
		lastTestAt,
		now: r.now,
	});
	if (due && r.result !== "not_assessable") {
		const impl = await implementationFor(tx, ctx.orgId, r.controlCode);
		if (impl) {
			const open = await openIdentityNonconformity(tx, ctx.orgId, impl);
			const raise = nonconformityDue({
				result: r.result,
				connectedAt: r.connectedAt ?? r.now,
				now: r.now,
				openNonconformity: open,
			});
			const test = await insertControlTest(
				tx,
				{ orgId: ctx.orgId, userId: null },
				{
					implementationId: impl,
					method: "automated",
					scope: "Identität: Konten und Anmeldungen",
					testedAt: r.now,
					testerUserId: null,
					result: r.result,
					notes: r.reasons
						.map((x) =>
							[x.code, x.count, x.value, x.limit]
								.filter((v) => v !== undefined)
								.join(" "),
						)
						.join("; ")
						.slice(0, 500),
					nonconformity: raise ? "auto" : "skip",
				},
			);
			audits.push(...test.audits);
			lastTestAt = r.now;
			lastTestResult = r.result;
			lastTestId = test.id;
		}
	}
	const values = {
		result: r.result,
		reasons: r.reasons,
		affected: r.affected.slice(0, 50),
		checkedAt: r.now,
		lastTestAt,
		lastTestResult,
		lastTestId,
	};
	if (prev)
		await tx
			.update(identityCheckResults)
			.set(values)
			.where(eq(identityCheckResults.id, prev.id));
	else
		await tx.insert(identityCheckResults).values({
			organizationId: ctx.orgId,
			checkKey: r.key,
			...values,
		});
	if (!prev || prev.result !== r.result)
		audits.push({
			action: "identity.check_changed",
			target: `organization:${ctx.orgId}`,
			before: prev ? { check: r.key, result: prev.result } : null,
			after: { check: r.key, result: r.result },
		});
	return audits;
}

async function implementationFor(
	tx: OrgTx,
	orgId: string,
	controlCode: string,
): Promise<string | null> {
	const [row] = await tx
		.select({ id: controlImplementations.id })
		.from(controlImplementations)
		.innerJoin(controls, eq(controls.id, controlImplementations.controlId))
		.where(
			and(
				eq(controlImplementations.organizationId, orgId),
				eq(controls.code, controlCode),
			),
		)
		.limit(1);
	return row?.id ?? null;
}

// Offene Abweichung aus einem automatischen Test dieses Controls?
async function openIdentityNonconformity(
	tx: OrgTx,
	orgId: string,
	implementationId: string,
): Promise<boolean> {
	const [row] = await tx
		.select({ id: nonconformities.id })
		.from(nonconformities)
		.innerJoin(controlTests, eq(controlTests.id, nonconformities.sourceRefId))
		.where(
			and(
				eq(nonconformities.organizationId, orgId),
				eq(nonconformities.source, "control_test"),
				sql`${nonconformities.status} <> 'closed'`,
				eq(controlTests.implementationId, implementationId),
				eq(controlTests.method, "automated"),
			),
		)
		.limit(1);
	return Boolean(row);
}

// ── Trennen ────────────────────────────────────────────────────────────

// Quelle trennen: Konten, Ausnahmen und Zuordnungen gehen per Kaskade mit;
// Zugriffsprüfungen bleiben als Nachweis (Bezug wird leer).
export async function disconnectSource(
	tx: OrgTx,
	ctx: { orgId: string },
	sourceId: string,
): Promise<AuditInput | null> {
	const [row] = await tx
		.delete(identitySources)
		.where(
			and(
				eq(identitySources.id, sourceId),
				eq(identitySources.organizationId, ctx.orgId),
			),
		)
		.returning({
			provider: identitySources.provider,
			tenantKey: identitySources.tenantKey,
		});
	if (!row) return null;
	return {
		action: "identity.disconnected",
		target: `organization:${ctx.orgId}`,
		before: { provider: row.provider, tenant: row.tenantKey },
	};
}
