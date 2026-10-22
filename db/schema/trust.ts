import { sql } from "drizzle-orm";
import {
	boolean,
	index,
	pgPolicy,
	pgTable,
	text,
	uuid,
} from "drizzle-orm/pg-core";
import { orgPolicy } from "../rls";
import { createdAt, json, orgId, pk, timestamps, ts, userRef } from "./_shared";
import {
	type Classification,
	TRUST_REQUEST_STATUS,
	type TrustDocumentAccess,
	type TrustFrameworkStatus,
} from "./enums";
import { accessTokens } from "./security";

// Trust Center je Org: eine öffentliche Vertrauensseite unter
// /vertrauen/<slug>. Die Org pflegt `settings` (Entwurf); erst
// „Veröffentlichen“ schreibt den `snapshot`, und nur der ist öffentlich.
// Die zweite SELECT-Policy gibt veröffentlichte Zeilen ohne Org-Kontext frei
// (wie access_tokens_by_hash) — die öffentliche Seite liest damit ohne
// Plattform-Zugriff, alles andere bleibt bei der Org.

export type TrustFrameworkEntry = {
	slug: string;
	status: TrustFrameworkStatus;
	validUntil: string | null;
	note: string | null;
};

export type TrustDocumentEntry = {
	documentId: string;
	access: TrustDocumentAccess;
};

export type TrustCenterSettings = {
	title: string;
	intro: string;
	contactEmail: string | null;
	ndaText: string;
	indexable: boolean;
	showCoverage: boolean;
	showControls: boolean;
	showSubprocessors: boolean;
	frameworks: TrustFrameworkEntry[];
	documents: TrustDocumentEntry[];
};

export type TrustSnapshotDocument = {
	versionId: string;
	documentId: string;
	docNumber: string;
	title: string;
	version: string;
	classification: Classification;
	access: TrustDocumentAccess;
	kind: "markdown" | "file";
	publishedAt: string | null;
};

export type TrustSnapshot = {
	orgName: string;
	title: string;
	intro: string;
	contactEmail: string | null;
	ndaText: string;
	ndaVersion: string;
	indexable: boolean;
	frameworks: {
		slug: string;
		name: string;
		status: TrustFrameworkStatus;
		validUntil: string | null;
		note: string | null;
		coverage: number | null;
	}[];
	domains: { domain: string; total: number; implemented: number }[] | null;
	subprocessors:
		| { name: string; category: string | null; locations: string[] }[]
		| null;
	documents: TrustSnapshotDocument[];
	generatedAt: string;
};

export const trustCenters = pgTable(
	"trust_centers",
	{
		id: pk(),
		organizationId: orgId().unique(),
		slug: text().notNull().unique(),
		published: boolean().notNull().default(false),
		settings: json<TrustCenterSettings>().notNull(),
		snapshot: json<TrustSnapshot>(),
		publishedAt: ts(),
		publishedByUserId: userRef(),
		...timestamps(),
	},
	() => [
		orgPolicy("trust_centers"),
		pgPolicy("trust_centers_public", {
			for: "select",
			to: "public",
			using: sql`published`,
		}),
	],
).enableRLS();

// Anfragen nach vertraulichen Unterlagen (NDA). Freigabe stellt ein
// Zugangstoken (klk_trust_, ADR-017) mit Subjekt = Anfrage aus.
export const trustAccessRequests = pgTable(
	"trust_access_requests",
	{
		id: pk(),
		organizationId: orgId(),
		name: text().notNull(),
		email: text().notNull(),
		company: text().notNull(),
		reason: text(),
		ndaAcceptedAt: ts().notNull(),
		ndaVersion: text().notNull(),
		status: text({ enum: TRUST_REQUEST_STATUS }).notNull().default("pending"),
		decidedByUserId: userRef(),
		decidedAt: ts(),
		note: text(),
		tokenId: uuid().references(() => accessTokens.id, {
			onDelete: "set null",
		}),
		expiresAt: ts(),
		ipHash: text(),
		createdAt: createdAt(),
	},
	(t) => [
		index("trust_access_requests_org_status_idx").on(
			t.organizationId,
			t.status,
		),
		orgPolicy("trust_access_requests"),
	],
).enableRLS();

export type TrustCenter = typeof trustCenters.$inferSelect;
export type TrustAccessRequest = typeof trustAccessRequests.$inferSelect;
