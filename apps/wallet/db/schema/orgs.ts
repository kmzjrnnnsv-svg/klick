import { sql } from "drizzle-orm";
import {
	bigint,
	boolean,
	index,
	integer,
	pgPolicy,
	pgTable,
	text,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { createdAt, pk, timestamps, ts } from "../../../../db/columns";
import { orgPolicy } from "../../../../db/rls";
import { user } from "../auth-schema";
import { memberPolicies } from "../policies";
import type { CustodyMode, InvitationStatus, MemberRole } from "./enums";

// Organisationen von both.money. Lesen darf die eigene Org (Kontext), jede
// Org mit eigener Mitgliedschaft (Auswahl beim Anmelden) und die Plattform;
// anlegen nur die Plattform (pnpm wallet:admin).
const ORG_SELF = sql`id = app_current_org() or app_is_platform()`;

export const orgs = pgTable(
	"orgs",
	{
		id: pk(),
		name: text().notNull(),
		slug: text().notNull().unique(),
		createdAt: createdAt(),
	},
	() => [
		pgPolicy("orgs_org", {
			for: "all",
			to: "public",
			using: ORG_SELF,
			withCheck: ORG_SELF,
		}),
		pgPolicy("orgs_member", {
			for: "select",
			to: "public",
			using: sql`id in (select m.organization_id from members m where m.user_id = app_current_user())`,
		}),
	],
).enableRLS();

const orgId = () =>
	uuid()
		.notNull()
		.references(() => orgs.id, { onDelete: "cascade" });

export const orgSettings = pgTable(
	"org_settings",
	{
		organizationId: uuid()
			.primaryKey()
			.references(() => orgs.id, { onDelete: "cascade" }),
		// Org-DEK, mit dem KEK umschlossen (WALLET_VAULT_KEK_*)
		encryptedDek: text().notNull(),
		keyVersion: integer().notNull().default(1),
		custodyMode: text().$type<CustodyMode>().notNull().default("none"),
		// Betreiber von both.money (eigene Bestände, Hot-Konten vor C1)
		isOperator: boolean().notNull().default(false),
		caspLicenceRef: text(),
		caspSetAt: ts(),
		caspSetBy: uuid(),
		// Fortlaufende Nummer der Export-Ereignisse nach Klick
		exportSeq: bigint({ mode: "number" }).notNull().default(0),
		...timestamps(),
	},
	() => [orgPolicy("org_settings")],
).enableRLS();

export const members = pgTable(
	"members",
	{
		id: pk(),
		organizationId: orgId(),
		userId: uuid()
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		role: text().$type<MemberRole>().notNull(),
		invitedBy: uuid(),
		createdAt: createdAt(),
	},
	(t) => [
		uniqueIndex("members_org_user_uq").on(t.organizationId, t.userId),
		index("members_user_idx").on(t.userId),
		...memberPolicies("members"),
	],
).enableRLS();

// Einladungen: Link (kwl_invite_…) steht nur als SHA-256 in verification
export const invitations = pgTable(
	"invitations",
	{
		id: pk(),
		organizationId: orgId(),
		email: text().notNull(),
		role: text().$type<MemberRole>().notNull(),
		status: text().$type<InvitationStatus>().notNull().default("pending"),
		invitedBy: uuid(),
		expiresAt: ts().notNull(),
		acceptedAt: ts(),
		acceptedBy: uuid(),
		createdAt: createdAt(),
	},
	(t) => [
		uniqueIndex("invitations_open_uq")
			.on(t.organizationId, t.email)
			.where(sql`status = 'pending'`),
		orgPolicy("invitations"),
	],
).enableRLS();
