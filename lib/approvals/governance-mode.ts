import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { approvalWorkflows, orgSettings } from "@/db/schema";
import type { GovernanceMode } from "@/db/schema/enums";
import type { AuditInput } from "@/lib/audit";
import {
	dutyKeys,
	requiredDuties,
} from "@/lib/compliance/catalog/approval-duties";
import { WORKFLOW_BY_KIND } from "@/lib/compliance/catalog/approval-workflows";
import type { OrgTx } from "@/lib/db/with-org";
import { ensureOrgWorkflows, sameSteps } from "./service";
import { TRIGGER_BY_KEY, triggerForKind } from "./triggers";

// Standard oder individuell (ADR-024). Zu „individuell“ ändert sich nichts
// sofort — die Abläufe werden im Designer frei. Zurück zum Standard:
// eigene Varianten aus, geänderte Standard-Abläufe als ausgeschaltete Kopie
// „… (eigene Fassung)“ gesichert und auf die Vorlage zurückgesetzt,
// Rahmenwerk-Pflichten an. Eigene Rollen bleiben.

export type ModeSwitchSummary = {
	variantsDisabled: number;
	copied: string[];
	enabled: string[];
};

export async function governanceModeOf(
	tx: OrgTx,
	orgId: string,
): Promise<GovernanceMode> {
	const [s] = await tx
		.select({ mode: orgSettings.governanceMode })
		.from(orgSettings)
		.where(eq(orgSettings.organizationId, orgId))
		.limit(1);
	return s?.mode ?? "standard";
}

export async function setGovernanceModeTx(
	tx: OrgTx,
	orgId: string,
	mode: GovernanceMode,
	ctx: { licenceStage: string; frameworks: readonly string[] },
): Promise<{ summary: ModeSwitchSummary; audit: AuditInput[] }> {
	const before = await governanceModeOf(tx, orgId);
	const summary: ModeSwitchSummary = {
		variantsDisabled: 0,
		copied: [],
		enabled: [],
	};
	if (before === mode) return { summary, audit: [] };
	if (mode === "standard") {
		await ensureOrgWorkflows(tx, orgId, ctx.licenceStage, {
			frameworks: ctx.frameworks,
		});
		const rows = await tx
			.select()
			.from(approvalWorkflows)
			.where(eq(approvalWorkflows.organizationId, orgId));
		for (const r of rows) {
			if (r.custom) {
				if (r.enabled) {
					await tx
						.update(approvalWorkflows)
						.set({ enabled: false })
						.where(eq(approvalWorkflows.id, r.id));
					summary.variantsDisabled += 1;
				}
				continue;
			}
			const t = WORKFLOW_BY_KIND.get(r.kind);
			if (!t) continue;
			const changed =
				!sameSteps(r.steps, t.steps) ||
				!sameSteps(r.conditions, t.conditions ?? []);
			if (!changed) continue;
			// eigene Fassung sichern (aus), Standard zurück auf die Vorlage
			await tx.insert(approvalWorkflows).values({
				organizationId: orgId,
				entityType: r.entityType,
				kind: `custom_${randomUUID().slice(0, 8)}`,
				name: `${r.name} (eigene Fassung)`,
				trigger: r.trigger,
				conditions: r.conditions,
				priority: r.priority,
				custom: true,
				description: r.description,
				steps: r.steps,
				enabled: false,
			});
			await tx
				.update(approvalWorkflows)
				.set({
					steps: t.steps,
					conditions: t.conditions ?? [],
					priority: t.priority ?? 0,
					name: t.name,
					description: t.description,
				})
				.where(eq(approvalWorkflows.id, r.id));
			summary.copied.push(r.kind);
		}
		// Pflichten wieder an — auch bewusst ausgeschaltete und die, die immer
		// gelten (Bestellung, Beschlüsse): der Standard trägt sie alle
		const stage = Number.parseInt(ctx.licenceStage.charAt(0), 10) || 0;
		const [s] = await tx
			.select({ applied: orgSettings.approvalDuties })
			.from(orgSettings)
			.where(eq(orgSettings.organizationId, orgId))
			.limit(1);
		const applied = { ...(s?.applied ?? {}) };
		const today = new Date().toISOString().slice(0, 10);
		for (const d of requiredDuties(ctx.frameworks, stage)) {
			const t = WORKFLOW_BY_KIND.get(d.kind);
			const trigger = t?.trigger ?? triggerForKind(d.kind)?.key;
			if (!trigger || !TRIGGER_BY_KEY.get(trigger)?.wired) continue;
			const res = await tx
				.update(approvalWorkflows)
				.set({ enabled: true })
				.where(
					and(
						eq(approvalWorkflows.organizationId, orgId),
						eq(approvalWorkflows.kind, d.kind),
						eq(approvalWorkflows.enabled, false),
					),
				)
				.returning({ id: approvalWorkflows.id });
			if (res.length > 0) summary.enabled.push(d.kind);
			for (const k of dutyKeys(d)) applied[k] = applied[k] ?? today;
		}
		await tx
			.update(orgSettings)
			.set({ approvalDuties: applied })
			.where(eq(orgSettings.organizationId, orgId));
	}
	await tx
		.update(orgSettings)
		.set({ governanceMode: mode })
		.where(eq(orgSettings.organizationId, orgId));
	return {
		summary,
		audit: [
			{
				action: "org.governance_mode_changed",
				target: `organization:${orgId}`,
				before: { mode: before },
				after: { mode, ...summary },
			},
		],
	};
}
