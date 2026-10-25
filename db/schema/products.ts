import {
	boolean,
	date,
	index,
	pgTable,
	text,
	unique,
	uuid,
} from "drizzle-orm/pg-core";
import { orgPolicy } from "../rls";
import { json, orgId, ownerFunction, pk, timestamps, userRef } from "./_shared";
import {
	CRA_CLASSES,
	PRODUCT_KINDS,
	PRODUCT_ROLES,
	PRODUCT_STATUS,
	type SbomSummary,
} from "./enums";
import { documents, evidence } from "./grc";

// Produktregister (CRA): Produkte mit digitalen Elementen, die die Org als
// Hersteller, Einführer oder Händler bereitstellt. Rolle und Anwendungsbereich
// steuern die Anwendbarkeit des CRA-Katalogs; Konformitätsweg und Checkliste
// werden abgeleitet (lib/compliance/cra.ts), nie gespeichert.

export const products = pgTable(
	"products",
	{
		id: pk(),
		organizationId: orgId(),
		code: text().notNull(),
		name: text().notNull(),
		description: text(),
		kind: text({ enum: PRODUCT_KINDS }).notNull().default("software"),
		role: text({ enum: PRODUCT_ROLES }).notNull().default("manufacturer"),
		version: text(),
		// null = noch nicht bewertet
		craInScope: boolean(),
		scopeReason: text(),
		craClass: text({ enum: CRA_CLASSES }).notNull().default("default"),
		classReason: text(),
		isFoss: boolean().notNull().default(false),
		// harmonisierte Norm, gemeinsame Spezifikation oder EUCC vollständig angewandt
		harmonisedStandards: boolean().notNull().default(false),
		placedOnMarketAt: date(),
		supportUntil: date(),
		supportReason: text(),
		vulnContact: text(),
		sbomEvidenceId: uuid().references(() => evidence.id, {
			onDelete: "set null",
		}),
		sbomSummary: json<SbomSummary>(),
		riskDocumentId: uuid().references(() => documents.id, {
			onDelete: "set null",
		}),
		techDocDocumentId: uuid().references(() => documents.id, {
			onDelete: "set null",
		}),
		declarationAt: date(),
		ceMarked: boolean().notNull().default(false),
		notifiedBody: text(),
		status: text({ enum: PRODUCT_STATUS }).notNull().default("development"),
		ownerUserId: userRef(),
		ownerFunction: ownerFunction(),
		assigneeUserId: userRef(),
		...timestamps(),
	},
	(t) => [
		unique().on(t.organizationId, t.code),
		index("products_org_status_idx").on(t.organizationId, t.status),
		orgPolicy("products"),
	],
).enableRLS();

export type Product = typeof products.$inferSelect;
