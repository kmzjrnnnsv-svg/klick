import { asc, eq } from "drizzle-orm";
import { assets, processes, providers } from "@/db/schema";
import type { LicenceStage } from "@/db/schema/enums";
import type { OrgTx } from "@/lib/db/with-org";
import { orgRiskMethod } from "@/lib/org/queries";
import { CONTROLS } from "./catalog";
import { applicableScenarios, RISK_SCENARIOS } from "./catalog/risk-scenarios";
import { listMembersForPicker, loadImplStatus } from "./queries";

// Daten für den Risiko-Assistenten (/risiken/neu, /risiken/[id]/bewerten).
export async function loadRiskWizardData(
	tx: OrgTx,
	orgId: string,
	frameworks: readonly string[],
	stage: LicenceStage,
) {
	const [method, impl, members, procRows, assetRows, providerRows] =
		await Promise.all([
			orgRiskMethod(tx, orgId),
			loadImplStatus(tx, orgId),
			listMembersForPicker(tx, orgId),
			tx
				.select({
					id: processes.id,
					code: processes.code,
					name: processes.name,
				})
				.from(processes)
				.where(eq(processes.organizationId, orgId))
				.orderBy(asc(processes.code)),
			tx
				.select({ id: assets.id, name: assets.name })
				.from(assets)
				.where(eq(assets.organizationId, orgId))
				.orderBy(asc(assets.name)),
			tx
				.select({ id: providers.id, name: providers.name })
				.from(providers)
				.where(eq(providers.organizationId, orgId))
				.orderBy(asc(providers.name)),
		]);
	const applicable = new Set(
		applicableScenarios(frameworks, stage).map((s) => s.code),
	);
	return {
		method,
		members,
		processes: procRows,
		assets: assetRows,
		providers: providerRows,
		controls: CONTROLS.map((c) => ({
			code: c.code,
			title: c.title,
			status: impl.get(c.code) ?? null,
		})),
		scenarios: RISK_SCENARIOS.map((s) => ({
			code: s.code,
			group: s.group,
			title: s.title,
			impactHint: s.impactHint,
			category: s.category,
			protectionGoals: s.protectionGoals,
			dimensions: s.dimensions,
			controls: s.controls,
			applicable: applicable.has(s.code),
		})),
	};
}
