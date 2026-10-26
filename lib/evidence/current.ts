import { and, eq, isNull, like, sql } from "drizzle-orm";
import { controlEvidence, controlImplementations, evidence } from "@/db/schema";
import type { ControlSheetState } from "@/db/schema/enums";
import type { OrgTx } from "@/lib/db/with-org";

// Fassungen von Nachweisen: jede Fassung ist eine eigene Zeile; die
// Vorgängerin bekommt beim Ersetzen superseded_at/superseded_by_id und
// zählt nicht mehr — weder in Prüfungsreife, SoA und Paket noch in der
// Ablauf-Erinnerung. Jede Zähl- oder Listenabfrage auf evidence oder
// control_evidence filtert mit currentEvidence() (Test evidence-current).

export type EvidenceValidity = "valid" | "expired" | "superseded";

// drizzle-Bedingung: nur die aktuelle Fassung
export const currentEvidence = () => isNull(evidence.supersededAt);

export function isCurrentEvidence(row: { supersededAt: Date | null }): boolean {
	return row.supersededAt === null;
}

// Stand für Anzeige und Zählung; today als YYYY-MM-DD (Berlin)
export function evidenceValidity(
	row: { supersededAt: Date | null; validUntil: string | null },
	today: string,
): EvidenceValidity {
	if (row.supersededAt !== null) return "superseded";
	if (row.validUntil !== null && row.validUntil < today) return "expired";
	return "valid";
}

// Ersetzt eine Fassung im Nachweisbogen: alte ID raus, neue rein (je
// Antwort und Position, ohne Doppelte). Rein.
export function replaceInSheet(
	sheet: ControlSheetState,
	oldId: string,
	newId: string,
): { sheet: ControlSheetState; changed: boolean } {
	let changed = false;
	const swap = (ids?: string[]) => {
		if (!ids?.includes(oldId)) return ids;
		changed = true;
		return [...new Set(ids.map((x) => (x === oldId ? newId : x)))];
	};
	const answers = sheet.answers
		? Object.fromEntries(
				Object.entries(sheet.answers).map(([k, v]) => [
					k,
					v.evidenceIds ? { ...v, evidenceIds: swap(v.evidenceIds) } : v,
				]),
			)
		: undefined;
	const items = sheet.items
		? Object.fromEntries(
				Object.entries(sheet.items).map(([k, v]) => [
					k,
					v.evidenceIds ? { ...v, evidenceIds: swap(v.evidenceIds) } : v,
				]),
			)
		: undefined;
	return {
		sheet: {
			...sheet,
			...(answers ? { answers } : {}),
			...(items ? { items } : {}),
		},
		changed,
	};
}

export type SupersedeResult = "ok" | "not_found" | "already_superseded";

// Vorgängerin sperren und prüfen — vor dem Anlegen der Nachfolgerin, damit
// zwei gleichzeitige neue Fassungen sich nicht verzweigen
export async function lockForSuccessor(
	tx: OrgTx,
	orgId: string,
	oldId: string,
): Promise<SupersedeResult> {
	const [old] = await tx
		.select({ id: evidence.id, supersededAt: evidence.supersededAt })
		.from(evidence)
		.where(and(eq(evidence.id, oldId), eq(evidence.organizationId, orgId)))
		.limit(1)
		.for("update");
	if (!old) return "not_found";
	return old.supersededAt ? "already_superseded" : "ok";
}

// Nachfolgerin übernimmt: Vorgängerin als ersetzt markieren, Verknüpfungen
// mit Controls und Positionen im Nachweisbogen übernehmen. In derselben
// Transaktion wie das Anlegen der Nachfolgerin.
export async function supersedeEvidence(
	tx: OrgTx,
	orgId: string,
	oldId: string,
	newId: string,
): Promise<SupersedeResult> {
	const state = await lockForSuccessor(tx, orgId, oldId);
	if (state !== "ok") return state;
	const now = new Date();
	await tx
		.update(evidence)
		.set({ supersededAt: now, supersededById: newId })
		.where(eq(evidence.id, oldId));
	await tx
		.update(evidence)
		.set({ supersedesId: oldId })
		.where(and(eq(evidence.id, newId), eq(evidence.organizationId, orgId)));
	// Controls der Vorgängerin
	const links = await tx
		.select({ implementationId: controlEvidence.implementationId })
		.from(controlEvidence)
		.where(
			and(
				eq(controlEvidence.organizationId, orgId),
				eq(controlEvidence.evidenceId, oldId),
			),
		);
	for (const l of links)
		await tx
			.insert(controlEvidence)
			.values({
				organizationId: orgId,
				implementationId: l.implementationId,
				evidenceId: newId,
			})
			.onConflictDoNothing();
	// Nachweisbögen, die die Vorgängerin nennen
	const sheets = await tx
		.select({
			id: controlImplementations.id,
			sheet: controlImplementations.sheet,
		})
		.from(controlImplementations)
		.where(
			and(
				eq(controlImplementations.organizationId, orgId),
				like(sql`${controlImplementations.sheet}::text`, `%${oldId}%`),
			),
		);
	for (const s of sheets) {
		const next = replaceInSheet(s.sheet ?? {}, oldId, newId);
		if (next.changed)
			await tx
				.update(controlImplementations)
				.set({ sheet: next.sheet })
				.where(eq(controlImplementations.id, s.id));
	}
	return "ok";
}
