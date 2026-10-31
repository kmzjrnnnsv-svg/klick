import { and, eq, sql } from "drizzle-orm";
import { globalDb } from "@/db";
import { member } from "@/db/auth-schema";
import { notifications, ssoProviderStates } from "@/db/schema";
import { listSsoProvidersForOrg } from "@/lib/auth/org";
import { fingerprintSet, latestNotAfter } from "@/lib/auth/saml-metadata";
import { certReminder, isSamlVendor } from "@/lib/auth/sso-saml-vendors";
import {
	fetchIdpMetadata,
	type MetadataFetch,
	providerStates,
	upsertProviderState,
} from "@/lib/auth/sso-setup-service";
import { mutateOrg, readOrg } from "@/lib/db/with-org";
import { logger } from "@/lib/log";
import { notify } from "@/lib/notifications/notify";

// Job sso-metadata (täglich 05:40, AP10c): Metadaten jedes SAML-Anbieters
// mit Adresse neu holen. Neues Zertifikat beim Anbieter → vormerken und
// Inhaber:innen benachrichtigen (übernommen wird nie automatisch, sondern
// über Vier-Augen, Art sso_saml_cert). Zertifikat läuft in 30 bzw. 7 Tagen
// ab oder ist abgelaufen → einmal je Stufe erinnern.

export type Fetcher = (
	url: string,
	vendor: Parameters<typeof fetchIdpMetadata>[1],
	domains: readonly string[],
	now: Date,
) => Promise<MetadataFetch>;

type State = Awaited<ReturnType<typeof providerStates>>[number];

async function ownersOf(orgId: string): Promise<string[]> {
	const rows = await globalDb
		.select({ userId: member.userId })
		.from(member)
		.where(and(eq(member.organizationId, orgId), eq(member.role, "owner")));
	return rows.map((r) => r.userId);
}

/** Einen Anbieter prüfen (Job und „Jetzt neu laden“). */
export async function checkProviderMetadata(
	orgId: string,
	st: State,
	domain: string,
	now: Date,
	fetcher: Fetcher = fetchIdpMetadata,
): Promise<"same" | "new_cert" | "error" | "skipped"> {
	if (!st.metadataUrl) return "skipped";
	const vendor = isSamlVendor(st.vendor) ? st.vendor : "other";
	const m = await fetcher(st.metadataUrl, vendor, [domain], now);
	const owners = await ownersOf(orgId);
	return mutateOrg({ orgId, userId: null }, async (tx) => {
		if (!m.ok) {
			await upsertProviderState(tx, orgId, st.providerId, {
				lastFetchAt: now,
				lastFetchError: m.error,
			});
			return { result: "error" as const, audit: [] };
		}
		const certs = m.metadata.certificates;
		const fps = fingerprintSet(certs);
		const notAfter = latestNotAfter(certs);
		if (fps === st.certFingerprints || fps === st.nextCertFingerprints) {
			await upsertProviderState(tx, orgId, st.providerId, {
				lastFetchAt: now,
				lastFetchError: null,
			});
			return { result: "same" as const, audit: [] };
		}
		await upsertProviderState(tx, orgId, st.providerId, {
			lastFetchAt: now,
			lastFetchError: null,
			nextMetadata: m.xml,
			nextCertFingerprints: fps,
			nextCertNotAfter: notAfter ? new Date(notAfter) : null,
			nextSeenAt: now,
		});
		await notify(tx, {
			orgId,
			recipients: owners,
			actorUserId: null,
			kind: "security_alert",
			title: `SSO: neues Zertifikat beim Anbieter (${st.providerId})`,
			body: "Klick hat ein neues Signaturzertifikat in den Metadaten gesehen. Prüf es unter Einstellungen > SSO und übernimm es, bevor das alte abläuft.",
			link: "/einstellungen?tab=sso",
			payload: { dedupeKey: `sso-next-cert:${st.providerId}:${fps}` },
		});
		return {
			result: "new_cert" as const,
			audit: {
				action: "sso.idp_cert_seen",
				target: `sso_provider:${st.providerId}`,
				after: { fingerprints: fps, notAfter },
			},
		};
	});
}

async function remindExpiry(orgId: string, st: State, now: Date) {
	const bucket = certReminder(st.certNotAfter, now);
	if (!bucket || !st.certNotAfter) return false;
	const dedupeKey = `sso-cert:${st.providerId}:${bucket}:${st.certNotAfter.toISOString()}`;
	const owners = await ownersOf(orgId);
	return mutateOrg({ orgId, userId: null }, async (tx) => {
		const [seen] = await tx
			.select({ id: notifications.id })
			.from(notifications)
			.where(
				and(
					eq(notifications.organizationId, orgId),
					sql`${notifications.payload}->>'dedupeKey' = ${dedupeKey}`,
				),
			)
			.limit(1);
		if (seen) return { result: false, audit: [] };
		await notify(tx, {
			orgId,
			recipients: owners,
			actorUserId: null,
			kind: bucket === "30" ? "review_due" : "security_alert",
			title:
				bucket === "expired"
					? `SSO: Zertifikat abgelaufen (${st.providerId})`
					: `SSO: Zertifikat läuft in ${bucket} Tagen ab (${st.providerId})`,
			body:
				bucket === "expired"
					? "Anmeldungen über diesen Anbieter scheitern. Leg beim Anbieter ein neues Zertifikat an und übernimm es unter Einstellungen > SSO."
					: "Leg beim Anbieter rechtzeitig ein neues Zertifikat an. Mit Metadaten-Adresse sieht Klick es von selbst, du übernimmst es unter Einstellungen > SSO.",
			link: "/einstellungen?tab=sso",
			payload: { dedupeKey },
		});
		return { result: true, audit: [] };
	});
}

export async function runSsoMetadata(
	now = new Date(),
	fetcher: Fetcher = fetchIdpMetadata,
): Promise<{ checked: number; newCerts: number; reminders: number }> {
	const orgIds = await globalDb.transaction(async (tx) => {
		await tx.execute(sql`select set_config('app.scope', 'platform', true)`);
		const rows = await tx
			.selectDistinct({ orgId: ssoProviderStates.organizationId })
			.from(ssoProviderStates);
		return rows.map((r) => r.orgId);
	});
	let checked = 0;
	let newCerts = 0;
	let reminders = 0;
	for (const orgId of orgIds) {
		const [states, providers] = await Promise.all([
			readOrg({ orgId, userId: null }, (tx) => providerStates(tx, orgId)),
			listSsoProvidersForOrg(orgId),
		]);
		const domains = new Map(providers.map((p) => [p.providerId, p.domain]));
		for (const st of states) {
			const domain = domains.get(st.providerId);
			if (!domain) continue; // Verbindung entfernt
			try {
				const r = await checkProviderMetadata(orgId, st, domain, now, fetcher);
				if (r !== "skipped") checked++;
				if (r === "new_cert") newCerts++;
				if (await remindExpiry(orgId, st, now)) reminders++;
			} catch (err) {
				logger.warn(
					{ err, orgId, providerId: st.providerId },
					"sso metadata check failed",
				);
			}
		}
	}
	logger.info(
		{ job: "sso-metadata", checked, newCerts, reminders },
		"sso metadata done",
	);
	return { checked, newCerts, reminders };
}
