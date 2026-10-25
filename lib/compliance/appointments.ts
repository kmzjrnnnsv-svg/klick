import { inArray } from "drizzle-orm";
import { roleAssignments } from "@/db/schema";
import type { AppointmentStatus } from "@/db/schema/enums";

// Bestellung durch die Geschäftsleitung: eine Besetzung wirkt erst ab
// „bestellt“ (Verantwortung, Freigaberechte, Unterschrift, Schulungen,
// Abdeckung). Eine beantragte Abberufung gilt bis zur Freigabe weiter.
// Vorschläge und Abgelehnte zeigen nur die Listen (Einrichtung,
// /organisation). Test tests/role-assignments-effective.test.ts hält alle
// Leser auf diesem Filter.

export const EFFECTIVE_STATUS = [
	"appointed",
	"revocation_requested",
] as const satisfies readonly AppointmentStatus[];

export function isEffective(status: AppointmentStatus | string): boolean {
	return (EFFECTIVE_STATUS as readonly string[]).includes(status);
}

// Bedingung für drizzle-Abfragen auf role_assignments
export function effectiveAssignment() {
	return inArray(roleAssignments.status, [...EFFECTIVE_STATUS]);
}
