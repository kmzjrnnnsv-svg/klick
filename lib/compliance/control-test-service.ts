import { and, eq, isNull } from "drizzle-orm";
import { controlImplementations, controls, controlTests } from "@/db/schema";
import type { ControlTestMethod } from "@/db/schema/enums";
import type { AuditInput } from "@/lib/audit";
import type { OrgTx } from "@/lib/db/with-org";
import { nonconformityFromTest } from "./nonconformity";
import { createNonconformity } from "./nonconformity-service";

// Wirksamkeitstest eintragen — aus dem Control-Dialog, aus Scan-Importen und
// aus Sicherheitsaufträgen. Nicht wirksam (fail) → Abweichung mit Aufgabe
// (ISO 9.1/10.2). Läuft in einer mutateOrg-Transaktion; die Audit-Einträge
// gehen an den Aufrufer, der sie als letzte Anweisung schreibt.

export type ControlTestInput = {
	implementationId: string;
	method: ControlTestMethod;
	scope?: string | null;
	testedAt?: Date | null;
	testerUserId?: string | null;
	result?: "pass" | "partial" | "fail" | null;
	notes?: string | null;
	nextTestAt?: string | null;
	evidenceId?: string | null;
	// „skip“: fail ohne eigene Abweichung — der Aufrufer entscheidet selbst
	// (automatische Prüfungen der Identität: erst nach der Einrichtungsfrist
	// und nur, wenn keine offen ist)
	nonconformity?: "auto" | "skip";
	// Ergebnis zu einem geplanten Test (Testprogramm): die geplante Zeile wird
	// durchgeführt statt eine zweite anzulegen — Prozess, Standort und Asset
	// der Planung bleiben, damit die Übung die Lücke schließt
	plannedTestId?: string | null;
	processId?: string | null;
	siteId?: string | null;
	assetId?: string | null;
};

export async function insertControlTest(
	tx: OrgTx,
	ctx: { orgId: string; userId: string | null },
	input: ControlTestInput,
): Promise<{ id: string; controlCode: string; audits: AuditInput[] }> {
	const [impl] = await tx
		.select({
			id: controlImplementations.id,
			code: controls.code,
			title: controls.title,
			ownerUserId: controlImplementations.ownerUserId,
		})
		.from(controlImplementations)
		.innerJoin(controls, eq(controls.id, controlImplementations.controlId))
		.where(
			and(
				eq(controlImplementations.id, input.implementationId),
				eq(controlImplementations.organizationId, ctx.orgId),
			),
		)
		.limit(1);
	if (!impl) throw new Error("notFound");
	const performed = {
		method: input.method,
		testedAt: input.testedAt ?? new Date(),
		testerUserId:
			input.testerUserId === undefined ? ctx.userId : input.testerUserId,
		result: input.result ?? null,
		notes: input.notes ?? null,
		nextTestAt: input.nextTestAt ?? null,
		evidenceId: input.evidenceId ?? null,
	};
	let row: { id: string } | undefined;
	if (input.plannedTestId) {
		// nur ein noch offener Test dieses Controls in dieser Org
		[row] = await tx
			.update(controlTests)
			.set({
				...performed,
				...(input.scope ? { scope: input.scope } : {}),
			})
			.where(
				and(
					eq(controlTests.id, input.plannedTestId),
					eq(controlTests.organizationId, ctx.orgId),
					eq(controlTests.implementationId, impl.id),
					isNull(controlTests.testedAt),
				),
			)
			.returning({ id: controlTests.id });
		if (!row) throw new Error("notFound");
	} else {
		[row] = await tx
			.insert(controlTests)
			.values({
				organizationId: ctx.orgId,
				implementationId: impl.id,
				scope: input.scope ?? null,
				processId: input.processId ?? null,
				siteId: input.siteId ?? null,
				assetId: input.assetId ?? null,
				...performed,
			})
			.returning({ id: controlTests.id });
	}
	if (!row) throw new Error("insert failed");
	const audits: AuditInput[] = [
		{
			action: "control.test",
			target: `control:${impl.id}`,
			after: {
				method: input.method,
				result: input.result ?? null,
				nextTestAt: input.nextTestAt ?? null,
				evidenceId: input.evidenceId ?? null,
				...(input.plannedTestId ? { plannedTestId: input.plannedTestId } : {}),
				...(input.processId ? { processId: input.processId } : {}),
			},
		},
	];
	if (input.result === "fail" && input.nonconformity !== "skip") {
		const draft = nonconformityFromTest({
			id: row.id,
			controlCode: impl.code,
			controlTitle: impl.title,
			method: input.method,
			notes: input.notes ?? null,
			ownerUserId: impl.ownerUserId ?? ctx.userId,
			result: input.result,
		});
		if (draft) {
			const nc = await createNonconformity(tx, ctx, draft);
			audits.push(nc.audit);
		}
	}
	return { id: row.id, controlCode: impl.code, audits };
}
