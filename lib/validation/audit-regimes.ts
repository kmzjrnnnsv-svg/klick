import { z } from "zod";
import {
	AUDIT_CYCLE_KINDS,
	FOLLOW_UP_CLASS_KEYS,
} from "@/lib/compliance/catalog/audit-regimes";

// Audits und Nacharbeitsfristen je Rahmenwerk (Einstellungen → Audits &
// Fristen). `setting: null` setzt das Rahmenwerk auf die Katalogwerte zurück.

const days = z.number().int().min(1).max(1095).nullable();
const rule = z.object({
	planDays: days,
	closeDays: days,
	untilNextAudit: z.boolean().optional(),
});
const kind = z.enum(AUDIT_CYCLE_KINDS);

export const auditRegimeSchema = z.object({
	framework: z
		.string()
		.regex(/^[a-z0-9-]+$/)
		.max(40),
	setting: z
		.object({
			cycles: z
				.array(
					z.object({ kind, everyMonths: z.number().int().min(0).max(120) }),
				)
				.max(AUDIT_CYCLE_KINDS.length)
				.optional(),
			classes: z.partialRecord(z.enum(FOLLOW_UP_CLASS_KEYS), rule).optional(),
			anchors: z.partialRecord(kind, z.iso.date()).optional(),
		})
		.nullable(),
});
export type AuditRegimeInput = z.infer<typeof auditRegimeSchema>;
