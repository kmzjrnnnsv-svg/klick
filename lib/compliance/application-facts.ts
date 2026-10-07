import type { CaspService } from "@/db/schema/enums";
import type { ApplicationItemState } from "@/db/schema/platform";
import type { OrgTx } from "@/lib/db/with-org";
import { getOrgSettings } from "@/lib/org/queries";
import type { ApplicationFacts } from "./application";
import { getOrgProfile, listControlRows } from "./queries";
import { listDocuments, listProviders } from "./queries-p2";
import { listProcesses, listRoleAssignments, listScopes } from "./queries-p3";
import {
	amlStatus,
	listCryptoAssets,
	listOwnFundsCalculations,
	listShareholders,
} from "./queries-p4";

// Fakten für die Antragsmappen — eine Ladefunktion für Seite und Export.
export async function loadApplicationFacts(
	tx: OrgTx,
	orgId: string,
): Promise<{
	facts: ApplicationFacts;
	services: readonly CaspService[];
	state: Record<string, ApplicationItemState>;
}> {
	const [
		profile,
		settings,
		docs,
		controls,
		assignments,
		ownFunds,
		aml,
		providers,
		procs,
		shareholders,
		assets,
		scopes,
	] = await Promise.all([
		getOrgProfile(tx, orgId),
		getOrgSettings(tx, orgId),
		listDocuments(tx, orgId),
		listControlRows(tx, orgId),
		listRoleAssignments(tx, orgId),
		listOwnFundsCalculations(tx, orgId),
		amlStatus(tx, orgId),
		listProviders(tx, orgId),
		listProcesses(tx, orgId),
		listShareholders(tx, orgId),
		listCryptoAssets(tx, orgId),
		listScopes(tx, orgId),
	]);
	const state = settings?.applicationState ?? {};
	const scopeSet = new Set<string>();
	for (const s of scopes) {
		if (s.frameworkSlug) scopeSet.add(s.frameworkSlug);
		else for (const f of profile?.frameworks ?? []) scopeSet.add(f);
	}
	const facts: ApplicationFacts = {
		documents: docs.map((d) => ({
			templateCode: d.templateCode,
			status: d.status,
		})),
		controls: new Map(controls.map((c) => [c.code, c.status])),
		functions: new Set(assignments.map((a) => a.function)),
		ownFundsApproved: ownFunds.some((r) => r.status === "approved"),
		amlAnalysisApproved: aml.analysisApproved,
		providers: providers.map((p) => ({ isOutsourcing: p.isOutsourcing })),
		processes: procs.filter((p) => p.status !== "retired").length,
		shareholders: shareholders.length,
		cryptoAssets: assets.length,
		scopes: scopeSet,
		manualDone: new Set(
			Object.entries(state)
				.filter(([, v]) => v.done)
				.map(([k]) => k),
		),
	};
	return { facts, services: profile?.profile.caspServices ?? [], state };
}
