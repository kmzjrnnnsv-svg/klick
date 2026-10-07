import { and, eq, inArray } from "drizzle-orm";
import { frameworks, obligationRuns, obligations } from "@/db/schema";
import type { LicenceStage } from "@/db/schema/enums";
import type { OrgTx } from "@/lib/db/with-org";
import {
	applicableObligations,
	type CatalogObligation,
} from "./catalog/obligations";
import { scheduleRuns } from "./obligations";

// Pflichten-Kalender je Org: Katalog → obligations-Zeilen (idempotent, nur
// fehlende Codes), Läufe für ein Zeitfenster planen (idempotent über
// unique(obligationId, periodLabel)). Wird von der Action „Pflichten
// übernehmen" und vom compliance-tick aufgerufen.

export async function syncObligations(
	tx: OrgTx,
	orgId: string,
	frameworkSlugs: readonly string[],
	stage: LicenceStage,
	opts: { tlptDesignated?: boolean; ownerUserId?: string | null } = {},
): Promise<{ created: string[]; deactivated: string[] }> {
	const applicable = applicableObligations(frameworkSlugs, stage, {
		tlptDesignated: opts.tlptDesignated,
	});
	const existing = await tx
		.select({
			id: obligations.id,
			code: obligations.code,
			active: obligations.active,
		})
		.from(obligations)
		.where(eq(obligations.organizationId, orgId));
	const byCode = new Map(existing.map((e) => [e.code, e]));
	const fwRows = await tx
		.select({ id: frameworks.id, slug: frameworks.slug })
		.from(frameworks)
		.where(
			inArray(frameworks.slug, [
				...new Set(applicable.flatMap((o) => o.frameworks)),
			]),
		);
	const fwId = new Map(fwRows.map((f) => [f.slug, f.id]));
	const created: string[] = [];
	for (const o of applicable) {
		const found = byCode.get(o.code);
		if (found) {
			if (!found.active)
				await tx
					.update(obligations)
					.set({ active: true })
					.where(eq(obligations.id, found.id));
			continue;
		}
		await tx.insert(obligations).values({
			organizationId: orgId,
			code: o.code,
			title: o.title,
			legalBasis: o.legalBasis,
			frameworkId: o.frameworks.map((f) => fwId.get(f)).find(Boolean) ?? null,
			frequency: o.frequency,
			dueRule: o.dueRule ?? null,
			recipient: o.recipient,
			ownerUserId: opts.ownerUserId ?? null,
			leadDays: o.leadDays,
			appliesFromStage: o.appliesFromStage ?? null,
			active: true,
		});
		created.push(o.code);
	}
	// Nicht mehr anwendbare Katalog-Pflichten deaktivieren (manuelle bleiben)
	const applicableCodes = new Set(applicable.map((o) => o.code));
	const deactivated: string[] = [];
	for (const e of existing) {
		if (e.active && e.code.startsWith("OBL-") && !applicableCodes.has(e.code)) {
			await tx
				.update(obligations)
				.set({ active: false })
				.where(eq(obligations.id, e.id));
			deactivated.push(e.code);
		}
	}
	return { created, deactivated };
}

// Läufe für [from, to] anlegen; vorhandene (periodLabel) bleiben unverändert.
export async function planObligationRuns(
	tx: OrgTx,
	orgId: string,
	from: Date,
	to: Date,
	catalogByCode: ReadonlyMap<string, CatalogObligation>,
): Promise<number> {
	const rows = await tx
		.select()
		.from(obligations)
		.where(
			and(eq(obligations.organizationId, orgId), eq(obligations.active, true)),
		);
	if (rows.length === 0) return 0;
	const existing = await tx
		.select({
			obligationId: obligationRuns.obligationId,
			periodLabel: obligationRuns.periodLabel,
		})
		.from(obligationRuns)
		.where(
			inArray(
				obligationRuns.obligationId,
				rows.map((r) => r.id),
			),
		);
	const have = new Set(
		existing.map((e) => `${e.obligationId}:${e.periodLabel}`),
	);
	let created = 0;
	for (const o of rows) {
		const cat = catalogByCode.get(o.code);
		const planned = scheduleRuns(
			{
				frequency: o.frequency,
				dueRule: o.dueRule,
				secondMonth: cat?.secondMonth ?? null,
				anchorYear: from.getUTCFullYear(),
			},
			from,
			to,
		);
		const fresh = planned.filter((p) => !have.has(`${o.id}:${p.periodLabel}`));
		if (fresh.length === 0) continue;
		await tx.insert(obligationRuns).values(
			fresh.map((p) => ({
				organizationId: orgId,
				obligationId: o.id,
				periodLabel: p.periodLabel,
				dueAt: p.dueAt,
				status: "upcoming" as const,
			})),
		);
		created += fresh.length;
	}
	return created;
}
