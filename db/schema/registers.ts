import {
	type AnyPgColumn,
	boolean,
	date,
	index,
	integer,
	pgTable,
	text,
	unique,
	uuid,
} from "drizzle-orm/pg-core";
import { orgPolicy } from "../rls";
import {
	json,
	orgId,
	pk,
	stringList,
	timestamps,
	ts,
	userRef,
} from "./_shared";
import { CLASSIFICATIONS, CRITICALITY, ROLE_FUNCTIONS } from "./enums";

// Register ohne Abhängigkeit auf grc.ts: Dienstleister, Assets, Prozesse.

export type ContractClauses = Record<string, boolean | string>;
export type DueDiligence = Record<string, boolean | string | null>;

export const providers = pgTable(
	"providers",
	{
		id: pk(),
		organizationId: orgId(),
		name: text().notNull(),
		lei: text(),
		partnerType: text({
			enum: [
				"ict",
				"outsourcing",
				"licence_partner",
				"bank",
				"issuer",
				"exchange",
				"custodian",
				"distribution",
			],
		})
			.notNull()
			.default("ict"),
		isIct: boolean().notNull().default(true),
		isOutsourcing: boolean().notNull().default(false),
		isMaterial: boolean().notNull().default(false),
		serviceDescription: text(),
		serviceType: text({
			enum: [
				"cloud_iaas",
				"cloud_paas",
				"cloud_saas",
				"hosting",
				"network",
				"software",
				"security",
				"payment",
				"data",
				"other",
			],
		}),
		functionsSupported: stringList(),
		criticality: text({ enum: CRITICALITY }).notNull().default("standard"),
		substitutability: text({
			enum: ["easy", "difficult", "not_substitutable"],
		}),
		country: text(),
		dataLocations: stringList(),
		subcontractors:
			json<{ name: string; country?: string; service?: string }[]>(),
		isIntraGroup: boolean().notNull().default(false),
		processesPersonalData: boolean().notNull().default(false),
		dpaSignedAt: date(),
		contractRef: text(),
		contractStart: date(),
		contractEnd: date(),
		noticePeriodDays: integer(),
		contractClauses: json<ContractClauses>(),
		exitStrategy: text(),
		exitPlanTestedAt: date(),
		riskAnalysisAt: date(),
		dueDiligence: json<DueDiligence>(),
		lastAssessmentAt: date(),
		nextAssessmentAt: date(),
		ownerUserId: userRef(),
		assigneeUserId: userRef(),
		status: text({ enum: ["active", "onboarding", "exiting", "terminated"] })
			.notNull()
			.default("active"),
		notes: text(),
		...timestamps(),
	},
	(t) => [
		index("providers_org_idx").on(t.organizationId),
		orgPolicy("providers"),
	],
).enableRLS();

export const assets = pgTable(
	"assets",
	{
		id: pk(),
		organizationId: orgId(),
		name: text().notNull(),
		type: text({
			enum: [
				"system",
				"application",
				"data",
				"service",
				"device",
				"facility",
				"key_material",
				"hsm",
			],
		})
			.notNull()
			.default("system"),
		classification: text({ enum: CLASSIFICATIONS })
			.notNull()
			.default("internal"),
		ownerUserId: userRef(),
		assigneeUserId: userRef(),
		providerId: uuid().references(() => providers.id, { onDelete: "set null" }),
		location: text(),
		description: text(),
		isLegacy: boolean().notNull().default(false),
		legacyReviewedAt: date(),
		// Schlüssel-/HSM-Inventar
		custodian: text(),
		backupLocation: text(),
		rotationDue: date(),
		ceremonyEvidenceId: uuid(),
		status: text({ enum: ["active", "retired"] })
			.notNull()
			.default("active"),
		...timestamps(),
	},
	(t) => [index("assets_org_idx").on(t.organizationId), orgPolicy("assets")],
).enableRLS();

export const processes = pgTable(
	"processes",
	{
		id: pk(),
		organizationId: orgId(),
		code: text().notNull(),
		name: text().notNull(),
		description: text(),
		category: text({ enum: ["core", "support", "management", "control"] })
			.notNull()
			.default("core"),
		ownerUserId: userRef(),
		deputyUserId: userRef(),
		assigneeUserId: userRef(),
		criticality: text({ enum: CRITICALITY }).notNull().default("standard"),
		rtoHours: integer(),
		rpoHours: integer(),
		mtpdHours: integer(),
		impactNotes: text(),
		inputs: text(),
		outputs: text(),
		kpis: json<{ name: string; target?: string }[]>(),
		parentProcessId: uuid().references((): AnyPgColumn => processes.id, {
			onDelete: "set null",
		}),
		reviewAt: date(),
		status: text({ enum: ["draft", "active", "retired"] })
			.notNull()
			.default("active"),
		...timestamps(),
	},
	(t) => [unique().on(t.organizationId, t.code), orgPolicy("processes")],
).enableRLS();

// RACI je Prozess: entweder konkreter User oder Funktion; genau ein A.
export const processRaci = pgTable(
	"process_raci",
	{
		id: pk(),
		organizationId: orgId(),
		processId: uuid()
			.notNull()
			.references(() => processes.id, { onDelete: "cascade" }),
		userId: userRef(),
		function: text({ enum: ROLE_FUNCTIONS }),
		raci: text({ enum: ["R", "A", "C", "I"] }).notNull(),
	},
	(t) => [
		index("process_raci_process_idx").on(t.processId),
		orgPolicy("process_raci"),
	],
).enableRLS();

export const lastReviewed = ts;

export type Provider = typeof providers.$inferSelect;
export type Asset = typeof assets.$inferSelect;
export type Process = typeof processes.$inferSelect;
