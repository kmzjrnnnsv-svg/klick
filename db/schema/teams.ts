import {
	boolean,
	index,
	pgTable,
	text,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { user } from "../auth-schema";
import { orgPolicy } from "../rls";
import { json, orgId, pk, ts, userRef } from "./_shared";
import type { NotificationKind } from "./enums";

// Benachrichtigungen in Microsoft Teams (T5). Eine App-Registrierung von
// Klick für mehrere Organisationen; je Org gibt die Kunden-IT sie im eigenen
// Tenant frei (Admin-Consent). Schreiben nur über lib/teams/service.ts.

// Kanäle je Art der Benachrichtigung: Mehrfachauswahl (Push-Benachrichtigungen
// je Person). Ältere Einträge speichern noch „mail“ | „teams“ | „both“ — gelesen
// nur über channelsFor (lib/notifications/channels.ts).
export const DELIVERY_CHANNELS = ["mail", "push", "teams"] as const;
export type DeliveryChannel = (typeof DELIVERY_CHANNELS)[number];
export type LegacyChannel = "mail" | "teams" | "both";
export type StoredChannels = LegacyChannel | DeliveryChannel[];

export const TEAMS_STATUSES = ["pending_consent", "active", "error"] as const;
export type TeamsStatus = (typeof TEAMS_STATUSES)[number];

// Je Org höchstens eine Verbindung zu einem Tenant
export const teamsIntegrations = pgTable(
	"teams_integrations",
	{
		id: pk(),
		organizationId: orgId(),
		tenantId: text().notNull(),
		status: text({ enum: TEAMS_STATUSES }).notNull().default("pending_consent"),
		// Inhaber:in schaltet die Zustellung ein und aus (Freigabe bleibt)
		enabled: boolean().notNull().default(false),
		// Einmalwert des laufenden Freigabe-Links (nur SHA-256), bis Ablauf
		consentNonceHash: text(),
		consentExpiresAt: ts(),
		consentedAt: ts(),
		// Katalog-ID der App im Tenant (nach dem Hochladen gefunden)
		catalogAppId: text(),
		lastError: text(),
		lastErrorAt: ts(),
		createdBy: userRef(),
		createdAt: ts().notNull().defaultNow(),
		updatedAt: ts().notNull().defaultNow(),
	},
	(t) => [
		uniqueIndex("teams_integrations_org_uq").on(t.organizationId),
		orgPolicy("teams_integrations"),
	],
).enableRLS();

// Zuordnung Konto → Entra-Objekt im Tenant und Stand der App-Installation
export const teamsUsers = pgTable(
	"teams_users",
	{
		id: pk(),
		organizationId: orgId(),
		userId: uuid()
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		aadObjectId: text(),
		appInstalledAt: ts(),
		lastError: text(),
		updatedAt: ts().notNull().defaultNow(),
	},
	(t) => [
		uniqueIndex("teams_users_org_user_uq").on(t.organizationId, t.userId),
		orgPolicy("teams_users"),
	],
).enableRLS();

// Je Person und Org: Kanal je Art der Benachrichtigung, Tages-Mail an/aus.
// Ohne Zeile gilt Mail für alles und die Tages-Mail.
export const notificationPreferences = pgTable(
	"notification_preferences",
	{
		id: pk(),
		organizationId: orgId(),
		userId: uuid()
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		channels: json<Partial<Record<NotificationKind, StoredChannels>>>()
			.notNull()
			.default({}),
		digestEnabled: boolean().notNull().default(true),
		updatedAt: ts().notNull().defaultNow(),
	},
	(t) => [
		uniqueIndex("notification_preferences_org_user_uq").on(
			t.organizationId,
			t.userId,
		),
		index("notification_preferences_user_idx").on(t.userId),
		orgPolicy("notification_preferences"),
	],
).enableRLS();

export type TeamsIntegration = typeof teamsIntegrations.$inferSelect;
export type NotificationPreference =
	typeof notificationPreferences.$inferSelect;

// Push-Benachrichtigungen (Web Push): je Person und Gerät ein Abo des
// Browsers für diese Organisation. Endpunkt nur bekannter Push-Dienste
// (lib/push/endpoint.ts), Schlüssel des Browsers zum Verschlüsseln; nie im
// Org-Export. Schreiben nur über lib/push/service.ts.
export const pushSubscriptions = pgTable(
	"push_subscriptions",
	{
		id: pk(),
		organizationId: orgId(),
		userId: uuid()
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		endpoint: text().notNull(),
		p256dh: text().notNull(),
		auth: text().notNull(),
		// Gerät, wie der Browser sich nennt (gekürzt), zur Anzeige
		label: text(),
		lastSuccessAt: ts(),
		lastError: text(),
		createdAt: ts().notNull().defaultNow(),
	},
	(t) => [
		uniqueIndex("push_subscriptions_org_endpoint_uq").on(
			t.organizationId,
			t.endpoint,
		),
		index("push_subscriptions_user_idx").on(t.userId),
		orgPolicy("push_subscriptions"),
	],
).enableRLS();

export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
