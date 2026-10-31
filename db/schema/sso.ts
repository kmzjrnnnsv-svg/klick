import { index, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { orgPolicy } from "../rls";
import { orgId, pk, ts, userRef } from "./_shared";

// SAML in fünf Minuten (AP10). Die Verbindung selbst liegt in `sso_provider`
// (Better Auth, ohne RLS, ADR-015); hier steht, was Klick dazu beobachtet:
// Anbieter-Vorlage, Metadaten-Adresse, Zertifikat und Ablauf, ein neues
// Zertifikat beim Anbieter (nie automatisch übernommen), Probe-Anmeldung.
// Schreiben nur über lib/auth/sso-setup-service.ts.

export const ssoProviderStates = pgTable(
	"sso_provider_states",
	{
		id: pk(),
		organizationId: orgId(),
		providerId: text().notNull(),
		vendor: text(),
		// Metadaten-Adresse des Anbieters (täglich abgerufen), sonst leer
		metadataUrl: text(),
		// Zertifikat(e), mit denen der Anbieter heute unterschreibt
		certFingerprints: text(),
		certNotAfter: ts(),
		// Beim Anbieter gesehen, aber noch nicht übernommen
		nextMetadata: text(),
		nextCertFingerprints: text(),
		nextCertNotAfter: ts(),
		nextSeenAt: ts(),
		lastFetchAt: ts(),
		lastFetchError: text(),
		// Letzte erfolgreiche Probe-Anmeldung
		probeOkAt: ts(),
		probeOkBy: userRef(),
		createdAt: ts().notNull().defaultNow(),
		updatedAt: ts().notNull().defaultNow(),
	},
	(t) => [
		uniqueIndex("sso_provider_states_org_provider_uq").on(
			t.organizationId,
			t.providerId,
		),
		orgPolicy("sso_provider_states"),
	],
).enableRLS();

// Probe-Anmeldung: gehört genau einer AuthnRequest (ID aus dem SAMLRequest).
// Ergebnis = was ankam, ohne Konto und ohne Sitzung.
export const ssoProbes = pgTable(
	"sso_probes",
	{
		id: pk(),
		organizationId: orgId(),
		providerId: text().notNull(),
		requestId: text().notNull(),
		requestedBy: userRef(),
		expiresAt: ts().notNull(),
		finishedAt: ts(),
		result: jsonb().$type<Record<string, unknown>>(),
		createdAt: ts().notNull().defaultNow(),
	},
	(t) => [
		uniqueIndex("sso_probes_request_uq").on(t.providerId, t.requestId),
		index("sso_probes_org_idx").on(t.organizationId, t.createdAt),
		orgPolicy("sso_probes"),
	],
).enableRLS();

export const SSO_SETUP_STATUSES = [
	"open",
	"submitted",
	"applied",
	"withdrawn",
] as const;
export type SsoSetupStatus = (typeof SSO_SETUP_STATUSES)[number];

// Einrichtungslink für die IT (klk_sso_, ADR-017): die IT-Person sieht nur
// die SSO-Werte dieser Org und schlägt die Metadaten vor; anlegen tut die
// Inhaberin (Step-up).
export const ssoSetupRequests = pgTable(
	"sso_setup_requests",
	{
		id: pk(),
		organizationId: orgId(),
		vendor: text().notNull(),
		providerId: text().notNull(),
		domain: text().notNull(),
		status: text({ enum: SSO_SETUP_STATUSES }).notNull().default("open"),
		// Vorschlag der IT
		metadataUrl: text(),
		metadataXml: text(),
		attributes: jsonb().$type<{
			email?: string;
			name?: string;
			groups?: string;
		}>(),
		contactName: text(),
		submittedAt: ts(),
		createdBy: userRef(),
		expiresAt: ts().notNull(),
		createdAt: ts().notNull().defaultNow(),
		updatedAt: ts().notNull().defaultNow(),
	},
	(t) => [
		index("sso_setup_requests_org_idx").on(t.organizationId, t.createdAt),
		orgPolicy("sso_setup_requests"),
	],
).enableRLS();
