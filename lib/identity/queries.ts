import {
	and,
	asc,
	desc,
	eq,
	ilike,
	inArray,
	isNotNull,
	isNull,
	lt,
	lte,
	or,
	type SQL,
	sql,
} from "drizzle-orm";
import { member, user } from "@/db/auth-schema";
import {
	identityAccounts,
	identityCheckResults,
	identityExceptions,
	identitySources,
	orgSettings,
} from "@/db/schema";
import type { OrgTx } from "@/lib/db/with-org";
import { type AccountFilter, inactiveBefore } from "./accounts";
import { type IdentityPolicy, identityPolicyOf } from "./policy";
import type { IdentityCheckKey } from "./types";

// Identität anbinden (Teil D, I1b): Lesen für Einstellungen, /team/konten
// und den Abschnitt am Control. Nie das Geheimnis einer Quelle; Listen mit
// ausdrücklichen Spalten, Filter und Zähler in SQL.

const today = (now: Date) => now.toISOString().slice(0, 10);

export async function identityPolicyFor(
	tx: OrgTx,
	orgId: string,
): Promise<IdentityPolicy> {
	const [row] = await tx
		.select({ policy: orgSettings.identityPolicy })
		.from(orgSettings)
		.where(eq(orgSettings.organizationId, orgId))
		.limit(1);
	return identityPolicyOf(row?.policy);
}

export type IdentitySourceView = {
	id: string;
	provider: "entra" | "google" | "okta";
	tenantKey: string;
	status: "pending_consent" | "active" | "error";
	connectedAt: Date | null;
	domains: string[];
	capabilities: {
		signIn: boolean;
		mfa: boolean;
		roles: boolean;
		leaveDate: boolean;
	} | null;
	lastSyncAt: Date | null;
	lastSyncOk: boolean | null;
	accountCount: number | null;
	lastError: string | null;
	consentOpen: boolean;
	// letzte vier Zeichen des Okta-Tokens, nie mehr
	tokenHint: string | null;
};

export async function identitySourceViews(
	tx: OrgTx,
	orgId: string,
	now = new Date(),
): Promise<IdentitySourceView[]> {
	const rows = await tx
		.select({
			id: identitySources.id,
			provider: identitySources.provider,
			tenantKey: identitySources.tenantKey,
			status: identitySources.status,
			connectedAt: identitySources.connectedAt,
			domains: identitySources.domains,
			capabilities: identitySources.capabilities,
			lastSyncAt: identitySources.lastSyncAt,
			lastSyncOk: identitySources.lastSyncOk,
			accountCount: identitySources.accountCount,
			lastError: identitySources.lastError,
			consentExpiresAt: identitySources.consentExpiresAt,
			settings: identitySources.settings,
		})
		.from(identitySources)
		.where(eq(identitySources.organizationId, orgId))
		.orderBy(asc(identitySources.provider));
	return rows.map(({ consentExpiresAt, settings, ...r }) => {
		const hint = (settings as { tokenHint?: unknown } | null)?.tokenHint;
		return {
			...r,
			consentOpen: consentExpiresAt !== null && consentExpiresAt > now,
			tokenHint:
				typeof hint === "string" && /^[A-Za-z0-9_-]{1,4}$/.test(hint)
					? hint
					: null,
		};
	});
}

export type CheckResultView = {
	key: IdentityCheckKey;
	result: "pass" | "partial" | "fail" | "not_assessable";
	reasons: { code: string; count?: number; value?: number; limit?: number }[];
	affectedCount: number;
	checkedAt: Date;
	lastTestId: string | null;
};

export async function identityCheckViews(
	tx: OrgTx,
	orgId: string,
): Promise<CheckResultView[]> {
	const rows = await tx
		.select({
			key: identityCheckResults.checkKey,
			result: identityCheckResults.result,
			reasons: identityCheckResults.reasons,
			affected: identityCheckResults.affected,
			checkedAt: identityCheckResults.checkedAt,
			lastTestId: identityCheckResults.lastTestId,
		})
		.from(identityCheckResults)
		.where(eq(identityCheckResults.organizationId, orgId));
	return rows.map(({ affected, ...r }) => ({
		...r,
		affectedCount: affected.length,
	}));
}

// Gilt noch: nicht widerrufen, Ablauf heute oder später
function activeExceptionSql(now: Date): SQL {
	return sql`exists (select 1 from ${identityExceptions} e
		where e.account_id = ${identityAccounts.id}
		and e.revoked_at is null and e.expires_at >= ${today(now)}::date)`;
}

async function affectedOf(
	tx: OrgTx,
	orgId: string,
	key: IdentityCheckKey,
): Promise<string[]> {
	const [row] = await tx
		.select({ affected: identityCheckResults.affected })
		.from(identityCheckResults)
		.where(
			and(
				eq(identityCheckResults.organizationId, orgId),
				eq(identityCheckResults.checkKey, key),
			),
		)
		.limit(1);
	return row?.affected ?? [];
}

async function accountConditions(
	tx: OrgTx,
	orgId: string,
	filter: AccountFilter,
	now: Date,
	policy: IdentityPolicy,
): Promise<SQL[]> {
	const where: SQL[] = [eq(identityAccounts.organizationId, orgId)];
	for (const chip of filter.chips) {
		if (chip === "ohne_mfa")
			where.push(
				eq(identityAccounts.mfaRegistered, false),
				eq(identityAccounts.enabled, true),
			);
		if (chip === "admins")
			where.push(
				or(
					eq(identityAccounts.isAdmin, true),
					eq(identityAccounts.isTopAdmin, true),
				) as SQL,
			);
		if (chip === "gaeste") where.push(eq(identityAccounts.kind, "guest"));
		if (chip === "inaktiv")
			where.push(
				eq(identityAccounts.enabled, true),
				lt(identityAccounts.lastSignInAt, inactiveBefore(now, policy)),
			);
		if (chip === "ausgeschieden")
			where.push(
				or(
					isNotNull(identityAccounts.markedLeftAt),
					lte(identityAccounts.leaveAt, now),
				) as SQL,
			);
		if (chip === "ausnahmen") where.push(activeExceptionSql(now));
	}
	if (filter.state === "aktiv")
		where.push(
			eq(identityAccounts.enabled, true),
			isNull(identityAccounts.missingSince),
		);
	if (filter.state === "deaktiviert")
		where.push(
			eq(identityAccounts.enabled, false),
			isNull(identityAccounts.missingSince),
		);
	if (filter.state === "verschwunden")
		where.push(isNotNull(identityAccounts.missingSince));
	if (filter.match === "zugeordnet")
		where.push(isNotNull(identityAccounts.matchedUserId));
	if (filter.match === "ohne")
		where.push(isNull(identityAccounts.matchedUserId));
	if (filter.check) {
		const ids = await affectedOf(tx, orgId, filter.check);
		where.push(ids.length > 0 ? inArray(identityAccounts.id, ids) : sql`false`);
	}
	if (filter.q) {
		const like = `%${filter.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
		where.push(
			or(
				ilike(identityAccounts.email, like),
				ilike(identityAccounts.displayName, like),
			) as SQL,
		);
	}
	return where;
}

export type AccountRow = {
	id: string;
	provider: "entra" | "google" | "okta";
	email: string | null;
	displayName: string;
	kind: "member" | "guest";
	enabled: boolean;
	isAdmin: boolean;
	isTopAdmin: boolean;
	adminRoles: string[];
	mfaRegistered: boolean | null;
	lastSignInAt: Date | null;
	createdAtSource: Date | null;
	leaveAt: Date | null;
	markedLeftAt: Date | null;
	missingSince: Date | null;
	matchedUserId: string | null;
	matchMode: "auto" | "manual" | "none";
	matchedName: string | null;
	exceptionUntil: string | null;
};

const ROW_COLUMNS = {
	id: identityAccounts.id,
	provider: identitySources.provider,
	email: identityAccounts.email,
	displayName: identityAccounts.displayName,
	kind: identityAccounts.kind,
	enabled: identityAccounts.enabled,
	isAdmin: identityAccounts.isAdmin,
	isTopAdmin: identityAccounts.isTopAdmin,
	adminRoles: identityAccounts.adminRoles,
	mfaRegistered: identityAccounts.mfaRegistered,
	lastSignInAt: identityAccounts.lastSignInAt,
	createdAtSource: identityAccounts.createdAtSource,
	leaveAt: identityAccounts.leaveAt,
	markedLeftAt: identityAccounts.markedLeftAt,
	missingSince: identityAccounts.missingSince,
	matchedUserId: identityAccounts.matchedUserId,
	matchMode: identityAccounts.matchMode,
	matchedName: sql<
		string | null
	>`coalesce(nullif(${user.name}, ''), ${user.email})`,
};

function exceptionUntilSql(now: Date) {
	return sql<
		string | null
	>`(select max(e.expires_at)::text from ${identityExceptions} e
		where e.account_id = ${identityAccounts.id}
		and e.revoked_at is null and e.expires_at >= ${today(now)}::date)`;
}

// Eine Seite der Konten; Admins und Probleme zuerst, dann nach Name
export async function pageIdentityAccounts(
	tx: OrgTx,
	orgId: string,
	input: {
		filter: AccountFilter;
		limit: number;
		offset: number;
		now: Date;
		policy: IdentityPolicy;
	},
): Promise<{ rows: AccountRow[]; total: number }> {
	const where = and(
		...(await accountConditions(
			tx,
			orgId,
			input.filter,
			input.now,
			input.policy,
		)),
	);
	const [{ n } = { n: 0 }] = await tx
		.select({ n: sql<number>`count(*)::int` })
		.from(identityAccounts)
		.where(where);
	const rows = await tx
		.select({ ...ROW_COLUMNS, exceptionUntil: exceptionUntilSql(input.now) })
		.from(identityAccounts)
		.innerJoin(
			identitySources,
			eq(identitySources.id, identityAccounts.sourceId),
		)
		.leftJoin(user, eq(user.id, identityAccounts.matchedUserId))
		.where(where)
		.orderBy(
			desc(identityAccounts.isTopAdmin),
			desc(identityAccounts.isAdmin),
			asc(
				sql`lower(coalesce(${identityAccounts.email}, ${identityAccounts.displayName}))`,
			),
			asc(identityAccounts.id),
		)
		.limit(input.limit)
		.offset(input.offset);
	return { rows, total: n };
}

// CSV: alle Treffer des Filters, höchstens 50 000
export async function exportIdentityAccounts(
	tx: OrgTx,
	orgId: string,
	input: { filter: AccountFilter; now: Date; policy: IdentityPolicy },
): Promise<AccountRow[]> {
	return (
		await pageIdentityAccounts(tx, orgId, {
			...input,
			limit: 50_000,
			offset: 0,
		})
	).rows;
}

export type AccountCounts = {
	all: number;
	withoutMfa: number;
	admins: number;
	guests: number;
	inactive: number;
	left: number;
	exceptions: number;
};

// Zähler für die Kacheln über der Liste (aktive, noch gemeldete Konten)
export async function identityAccountCounts(
	tx: OrgTx,
	orgId: string,
	now: Date,
	policy: IdentityPolicy,
): Promise<AccountCounts> {
	const before = inactiveBefore(now, policy).toISOString();
	const [row] = await tx
		.select({
			all: sql<number>`count(*)::int`,
			withoutMfa: sql<number>`count(*) filter (where ${identityAccounts.enabled} and ${identityAccounts.mfaRegistered} = false)::int`,
			admins: sql<number>`count(*) filter (where ${identityAccounts.isAdmin} or ${identityAccounts.isTopAdmin})::int`,
			guests: sql<number>`count(*) filter (where ${identityAccounts.kind} = 'guest')::int`,
			inactive: sql<number>`count(*) filter (where ${identityAccounts.enabled} and ${identityAccounts.lastSignInAt} < ${before}::timestamptz)::int`,
			left: sql<number>`count(*) filter (where ${identityAccounts.markedLeftAt} is not null or ${identityAccounts.leaveAt} <= ${now.toISOString()}::timestamptz)::int`,
			exceptions: sql<number>`count(*) filter (where ${activeExceptionSql(now)})::int`,
		})
		.from(identityAccounts)
		.where(
			and(
				eq(identityAccounts.organizationId, orgId),
				isNull(identityAccounts.missingSince),
			),
		);
	return (
		row ?? {
			all: 0,
			withoutMfa: 0,
			admins: 0,
			guests: 0,
			inactive: 0,
			left: 0,
			exceptions: 0,
		}
	);
}

export type ExceptionView = {
	id: string;
	kind: "emergency" | "service" | "other";
	reason: string;
	expiresAt: string;
	createdAt: Date;
	createdBy: string | null;
	createdByName: string | null;
	revokedAt: Date | null;
};

export async function identityAccountDetail(
	tx: OrgTx,
	orgId: string,
	id: string,
	now: Date,
): Promise<{
	account: AccountRow & { firstSeenAt: Date; lastSeenAt: Date };
	exceptions: ExceptionView[];
} | null> {
	const [account] = await tx
		.select({
			...ROW_COLUMNS,
			exceptionUntil: exceptionUntilSql(now),
			firstSeenAt: identityAccounts.firstSeenAt,
			lastSeenAt: identityAccounts.lastSeenAt,
		})
		.from(identityAccounts)
		.innerJoin(
			identitySources,
			eq(identitySources.id, identityAccounts.sourceId),
		)
		.leftJoin(user, eq(user.id, identityAccounts.matchedUserId))
		.where(
			and(
				eq(identityAccounts.organizationId, orgId),
				eq(identityAccounts.id, id),
			),
		)
		.limit(1);
	if (!account) return null;
	const exceptions = await tx
		.select({
			id: identityExceptions.id,
			kind: identityExceptions.kind,
			reason: identityExceptions.reason,
			expiresAt: identityExceptions.expiresAt,
			createdAt: identityExceptions.createdAt,
			createdBy: identityExceptions.createdBy,
			createdByName: sql<
				string | null
			>`coalesce(nullif(${user.name}, ''), ${user.email})`,
			revokedAt: identityExceptions.revokedAt,
		})
		.from(identityExceptions)
		.leftJoin(user, eq(user.id, identityExceptions.createdBy))
		.where(
			and(
				eq(identityExceptions.organizationId, orgId),
				eq(identityExceptions.accountId, id),
			),
		)
		.orderBy(desc(identityExceptions.createdAt));
	return { account, exceptions };
}

// Personen, denen ein Konto von Hand zugeordnet werden kann (Mitglieder)
export async function identityMatchOptions(
	tx: OrgTx,
	orgId: string,
): Promise<{ userId: string; label: string }[]> {
	const rows = await tx
		.select({ userId: user.id, name: user.name, email: user.email })
		.from(member)
		.innerJoin(user, eq(user.id, member.userId))
		.where(eq(member.organizationId, orgId))
		.orderBy(
			asc(sql`lower(coalesce(nullif(${user.name}, ''), ${user.email}))`),
		);
	return rows.map((r) => ({
		userId: r.userId,
		label: r.name ? `${r.name} (${r.email})` : r.email,
	}));
}

// Gibt es überhaupt eine Quelle (auch offene Freigabe)? Für Karte und Hinweise
export async function hasIdentitySource(
	tx: OrgTx,
	orgId: string,
): Promise<boolean> {
	const [row] = await tx
		.select({ id: identitySources.id })
		.from(identitySources)
		.where(eq(identitySources.organizationId, orgId))
		.limit(1);
	return Boolean(row);
}
