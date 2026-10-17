import { and, eq, inArray } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import { member } from "@/db/auth-schema";
import type { OrgTx } from "./with-org";

type OrgTable = PgTable & { id: AnyPgColumn; organizationId: AnyPgColumn };

// Nur IDs, die zur Org gehören — einmal je ID, Reihenfolge wie eingegeben.
// Für Verknüpfungen aus Formularen: Fremd-IDs (FK-Prüfungen umgehen RLS) und
// Doppelte (Unique-Verletzung → Fehler) fallen still heraus.
export async function ownedIds(
	tx: OrgTx,
	table: OrgTable,
	orgId: string,
	ids: readonly string[] | undefined,
): Promise<string[]> {
	const uniq = [...new Set(ids ?? [])];
	if (uniq.length === 0) return [];
	const rows = await tx
		.select({ id: table.id })
		.from(table as PgTable)
		.where(and(eq(table.organizationId, orgId), inArray(table.id, uniq)));
	const ok = new Set(rows.map((r) => String(r.id)));
	return uniq.filter((id) => ok.has(id));
}

// Mitglied der Org? `member` hat kein RLS (ADR-009) — daher explizit filtern.
// Für Zuweisungen (Aufgabe, Nachweis-Anforderung): keine Aufgaben an Fremde.
export async function isOrgMember(
	tx: OrgTx,
	orgId: string,
	userId: string,
): Promise<boolean> {
	const [row] = await tx
		.select({ id: member.id })
		.from(member)
		.where(and(eq(member.organizationId, orgId), eq(member.userId, userId)))
		.limit(1);
	return Boolean(row);
}
