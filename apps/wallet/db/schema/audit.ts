import { bigint, index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, json, pk, ts } from "../../../../db/columns";
import { appendOnlyOrgPolicies, orgPolicy } from "../../../../db/rls";
import { user } from "../auth-schema";
import type { NotificationKind } from "./enums";
import { orgs } from "./orgs";

// Audit-Log wie bei Klick: nur anhängend (Policies + Trigger in 0000_init),
// SHA-256-Kette je Org bzw. Plattform (lib/audit-hash.ts).
export const auditLog = pgTable(
	"audit_log",
	{
		id: uuid().primaryKey(),
		seq: bigint({ mode: "bigint" }).generatedAlwaysAsIdentity(),
		organizationId: uuid(),
		actorUserId: uuid(),
		action: text().notNull(),
		target: text(),
		before: json<unknown>(),
		after: json<unknown>(),
		ip: text(),
		userAgent: text(),
		outcome: text({ enum: ["success", "failure", "denied"] })
			.notNull()
			.default("success"),
		prevHash: text(),
		hash: text().notNull(),
		at: ts().notNull().defaultNow(),
	},
	(t) => [
		index("audit_log_org_seq_idx").on(t.organizationId, t.seq),
		index("audit_log_target_idx").on(t.target),
		...appendOnlyOrgPolicies("audit_log"),
	],
).enableRLS();

export const notifications = pgTable(
	"notifications",
	{
		id: pk(),
		organizationId: uuid()
			.notNull()
			.references(() => orgs.id, { onDelete: "cascade" }),
		userId: uuid()
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		kind: text().$type<NotificationKind>().notNull(),
		title: text().notNull(),
		body: text(),
		link: text(),
		payload: json<Record<string, unknown>>(),
		readAt: ts(),
		emailedAt: ts(),
		createdAt: createdAt(),
	},
	(t) => [
		index("notifications_user_read_idx").on(t.userId, t.readAt),
		orgPolicy("notifications"),
	],
).enableRLS();
