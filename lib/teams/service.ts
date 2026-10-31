import { and, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import { member, user } from "@/db/auth-schema";
import {
	notifications,
	type TeamsIntegration,
	teamsIntegrations,
	teamsUsers,
} from "@/db/schema";
import type { AuditInput } from "@/lib/audit";
import type { OrgTx } from "@/lib/db/with-org";
import {
	channelFor,
	TEAMS_MAX_ATTEMPTS,
	teamsWanted,
} from "@/lib/notifications/channels";
import { notify } from "@/lib/notifications/notify";
import { loadChannelPrefs } from "@/lib/notifications/prefs";
import { safeInternalPath } from "@/lib/safe-path";
import {
	CONSENT_TTL_MS,
	newNonce,
	nonceHash,
	sealConsentState,
} from "./consent";
import type { GraphClient, GraphError } from "./graph";

// Schreiben rund um Teams nur hier (T5): Freigabe, Schalter, Zustellung.
// Alles im Org-Kontext (RLS); Audits liefert der Dienst an mutateOrg.

export async function teamsIntegrationOf(
	tx: OrgTx,
	orgId: string,
): Promise<TeamsIntegration | null> {
	const [row] = await tx
		.select()
		.from(teamsIntegrations)
		.where(eq(teamsIntegrations.organizationId, orgId))
		.limit(1);
	return row ?? null;
}

// Freigabe-Link vorbereiten: Tenant merken, Einmalwert ablegen. Wechselt
// der Tenant, beginnt die Freigabe von vorn.
export async function prepareConsent(
	tx: OrgTx,
	input: {
		orgId: string;
		userId: string;
		tenantId: string;
		secret: string;
		now: Date;
	},
): Promise<{ state: string; audit: AuditInput }> {
	const before = await teamsIntegrationOf(tx, input.orgId);
	const nonce = newNonce();
	const expires = new Date(input.now.getTime() + CONSENT_TTL_MS);
	const sameTenant = before?.tenantId === input.tenantId;
	const values = {
		tenantId: input.tenantId,
		consentNonceHash: nonceHash(nonce),
		consentExpiresAt: expires,
		updatedAt: input.now,
		...(sameTenant
			? {}
			: {
					status: "pending_consent" as const,
					enabled: false,
					consentedAt: null,
					catalogAppId: null,
					lastError: null,
					lastErrorAt: null,
				}),
	};
	if (before)
		await tx
			.update(teamsIntegrations)
			.set(values)
			.where(eq(teamsIntegrations.id, before.id));
	else
		await tx.insert(teamsIntegrations).values({
			organizationId: input.orgId,
			createdBy: input.userId,
			...values,
		});
	return {
		state: sealConsentState(
			input.orgId,
			nonce,
			expires.getTime(),
			input.secret,
		),
		audit: {
			action: "teams.consent_started",
			target: `organization:${input.orgId}`,
			before: before
				? { tenantId: before.tenantId, status: before.status }
				: null,
			after: { tenantId: input.tenantId },
		},
	};
}

// Rückruf von Microsoft: nur mit passendem Einmalwert, vor Ablauf und für
// den gemerkten Tenant
export async function completeConsent(
	tx: OrgTx,
	input: {
		orgId: string;
		nonce: string;
		tenantId: string | null;
		granted: boolean;
		error: string | null;
		now: Date;
	},
): Promise<{ result: "active" | "denied" | "invalid"; audit: AuditInput[] }> {
	const row = await teamsIntegrationOf(tx, input.orgId);
	if (
		!row?.consentNonceHash ||
		row.consentNonceHash !== nonceHash(input.nonce) ||
		!row.consentExpiresAt ||
		row.consentExpiresAt < input.now ||
		(input.tenantId !== null &&
			input.tenantId.toLowerCase() !== row.tenantId.toLowerCase())
	)
		return { result: "invalid", audit: [] };
	const granted = input.granted && !input.error;
	await tx
		.update(teamsIntegrations)
		.set({
			consentNonceHash: null,
			consentExpiresAt: null,
			updatedAt: input.now,
			...(granted
				? { status: "active" as const, consentedAt: input.now, lastError: null }
				: {
						lastError: (input.error ?? "denied").slice(0, 120),
						lastErrorAt: input.now,
					}),
		})
		.where(eq(teamsIntegrations.id, row.id));
	if (granted) {
		const owners = await tx
			.select({ id: member.userId })
			.from(member)
			.where(
				and(eq(member.organizationId, input.orgId), eq(member.role, "owner")),
			);
		await notify(tx, {
			orgId: input.orgId,
			recipients: owners.map((o) => o.id),
			actorUserId: null,
			kind: "system",
			title: "Microsoft Teams ist freigegeben",
			body: "Schalte die Zustellung unter Einstellungen > Integrationen ein.",
			link: "/einstellungen?tab=integrationen",
		});
	}
	return {
		result: granted ? "active" : "denied",
		audit: [
			{
				action: granted ? "teams.consented" : "teams.consent_denied",
				target: `organization:${input.orgId}`,
				before: { status: row.status },
				after: granted
					? { status: "active", tenantId: row.tenantId }
					: { error: (input.error ?? "denied").slice(0, 120) },
			},
		],
	};
}

export async function setTeamsEnabled(
	tx: OrgTx,
	orgId: string,
	enabled: boolean,
	now: Date,
): Promise<{ ok: boolean; audit: AuditInput[] }> {
	const row = await teamsIntegrationOf(tx, orgId);
	if (!row || (enabled && row.status !== "active"))
		return { ok: false, audit: [] };
	await tx
		.update(teamsIntegrations)
		.set({ enabled, updatedAt: now })
		.where(eq(teamsIntegrations.id, row.id));
	return {
		ok: true,
		audit: [
			{
				action: "teams.enabled",
				target: `organization:${orgId}`,
				before: { enabled: row.enabled },
				after: { enabled },
			},
		],
	};
}

export async function removeTeams(
	tx: OrgTx,
	orgId: string,
): Promise<AuditInput[]> {
	const row = await teamsIntegrationOf(tx, orgId);
	if (!row) return [];
	await tx.delete(teamsUsers).where(eq(teamsUsers.organizationId, orgId));
	await tx.delete(teamsIntegrations).where(eq(teamsIntegrations.id, row.id));
	return [
		{
			action: "teams.removed",
			target: `organization:${orgId}`,
			before: { tenantId: row.tenantId, status: row.status },
			after: null,
		},
	];
}

// Link aus der Benachrichtigung als absolute Adresse der eigenen Instanz
export function teamsWebUrl(baseUrl: string, link: string | null): string {
	const root = baseUrl.replace(/\/$/, "");
	if (link && /^https?:\/\//i.test(link))
		return link.startsWith(`${root}/`) ? link : `${root}/heute`;
	const path = link ? safeInternalPath(link, "") : "";
	return `${root}${path || "/heute"}`;
}

const MAX_AGE_DAYS = 3;
const MAX_PER_RUN = 20;

export type DeliveryStats = { sent: number; failed: number; skipped: number };

// Offene Benachrichtigungen einer Org in Teams zustellen (Job teams-notify)
export async function deliverTeams(
	tx: OrgTx,
	orgId: string,
	client: GraphClient,
	opts: { baseUrl: string; now: Date },
): Promise<DeliveryStats> {
	const stats: DeliveryStats = { sent: 0, failed: 0, skipped: 0 };
	const integration = await teamsIntegrationOf(tx, orgId);
	if (!integration || integration.status !== "active" || !integration.enabled)
		return stats;
	const prefs = await loadChannelPrefs(tx, orgId);
	const wantsTeams = [...prefs.entries()]
		.filter(([, p]) => Object.values(p.channels).some((c) => c !== "mail"))
		.map(([u]) => u);
	if (wantsTeams.length === 0) return stats;
	const since = new Date(opts.now.getTime() - MAX_AGE_DAYS * 86_400_000);
	const rows = await tx
		.select({
			id: notifications.id,
			userId: notifications.userId,
			kind: notifications.kind,
			title: notifications.title,
			link: notifications.link,
			teamsAttempts: notifications.teamsAttempts,
			email: user.email,
		})
		.from(notifications)
		.innerJoin(user, eq(user.id, notifications.userId))
		.where(
			and(
				eq(notifications.organizationId, orgId),
				inArray(notifications.userId, wantsTeams),
				isNull(notifications.teamsSentAt),
				lt(notifications.teamsAttempts, TEAMS_MAX_ATTEMPTS),
				gte(notifications.createdAt, since),
			),
		)
		.orderBy(notifications.createdAt)
		.limit(MAX_PER_RUN);

	const failIntegration = async (error: GraphError) => {
		await tx
			.update(teamsIntegrations)
			.set({
				status: error === "consent_missing" ? "error" : integration.status,
				lastError: error,
				lastErrorAt: opts.now,
				updatedAt: opts.now,
			})
			.where(eq(teamsIntegrations.id, integration.id));
	};

	let catalogAppId = integration.catalogAppId;
	const tenant = integration.tenantId;
	for (const r of rows) {
		const state = {
			teamsActive: true,
			teamsSentAt: null,
			teamsAttempts: r.teamsAttempts,
		};
		if (!teamsWanted(channelFor(prefs.get(r.userId), r.kind), state)) {
			stats.skipped++;
			continue;
		}
		const fail = async (error: GraphError, perUser = false) => {
			stats.failed++;
			await tx
				.update(notifications)
				.set({ teamsAttempts: r.teamsAttempts + 1 })
				.where(eq(notifications.id, r.id));
			if (perUser)
				await tx
					.insert(teamsUsers)
					.values({
						organizationId: orgId,
						userId: r.userId,
						lastError: error,
						updatedAt: opts.now,
					})
					.onConflictDoUpdate({
						target: [teamsUsers.organizationId, teamsUsers.userId],
						set: { lastError: error, updatedAt: opts.now },
					});
		};
		// Freigabe fehlt oder Microsoft drosselt: abbrechen, nicht zählen
		const stopOn = (e: GraphError) =>
			e === "consent_missing" || e === "throttled";

		if (!catalogAppId) {
			const app = await client.findCatalogApp(tenant);
			if (!app.ok) {
				if (stopOn(app.error)) {
					await failIntegration(app.error);
					break;
				}
				await failIntegration(app.error);
				await fail(app.error);
				continue;
			}
			catalogAppId = app.value;
			await tx
				.update(teamsIntegrations)
				.set({ catalogAppId, updatedAt: opts.now })
				.where(eq(teamsIntegrations.id, integration.id));
		}

		const [known] = await tx
			.select()
			.from(teamsUsers)
			.where(
				and(
					eq(teamsUsers.organizationId, orgId),
					eq(teamsUsers.userId, r.userId),
				),
			)
			.limit(1);
		let aad = known?.aadObjectId ?? null;
		if (!aad) {
			const found = await client.findUser(tenant, r.email);
			if (!found.ok) {
				if (stopOn(found.error)) {
					await failIntegration(found.error);
					break;
				}
				await fail(found.error, true);
				continue;
			}
			aad = found.value;
		}
		if (!known?.appInstalledAt) {
			const inst = await client.installApp(tenant, aad, catalogAppId);
			if (!inst.ok) {
				if (stopOn(inst.error)) {
					await failIntegration(inst.error);
					break;
				}
				await fail(inst.error, true);
				continue;
			}
		}
		await tx
			.insert(teamsUsers)
			.values({
				organizationId: orgId,
				userId: r.userId,
				aadObjectId: aad,
				appInstalledAt: known?.appInstalledAt ?? opts.now,
				lastError: null,
				updatedAt: opts.now,
			})
			.onConflictDoUpdate({
				target: [teamsUsers.organizationId, teamsUsers.userId],
				set: {
					aadObjectId: aad,
					appInstalledAt: known?.appInstalledAt ?? opts.now,
					lastError: null,
					updatedAt: opts.now,
				},
			});
		const sent = await client.sendActivity(tenant, aad, {
			title: r.title,
			webUrl: teamsWebUrl(opts.baseUrl, r.link),
		});
		if (!sent.ok) {
			if (stopOn(sent.error)) {
				await failIntegration(sent.error);
				break;
			}
			await fail(sent.error, true);
			continue;
		}
		await tx
			.update(notifications)
			.set({ teamsSentAt: opts.now })
			.where(eq(notifications.id, r.id));
		stats.sent++;
	}
	return stats;
}
