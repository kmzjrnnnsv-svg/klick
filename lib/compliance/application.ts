import type { CaspService, ImplStatus, RoleFunction } from "@/db/schema/enums";

// Antragsmappen (MiCAR Art. 62 / ZAG § 10): jeder Bestandteil verknüpft
// Module der Plattform; die Vollständigkeit wird aus deren Zustand abgeleitet,
// nie gepflegt. Pure Funktion — die Fakten lädt die Seite in readOrg.

export type ApplicationCheck =
	| {
			kind: "documents";
			templateCodes: readonly string[];
			minStatus?: "approved" | "published";
	  }
	| { kind: "controls"; codes: readonly string[] }
	| { kind: "functions"; functions: readonly RoleFunction[] }
	| { kind: "own_funds" }
	| { kind: "aml_risk_analysis" }
	| { kind: "providers"; filter: "outsourcing" | "any" }
	| { kind: "processes"; min?: number }
	| { kind: "shareholders" }
	| { kind: "crypto_assets" }
	| { kind: "scope"; framework: string }
	| { kind: "manual"; hint: string };

export type ApplicationItem = {
	code: string;
	title: string;
	legalBasis: string;
	description: string;
	// Modul, das den Bestandteil liefert
	route: string;
	checks: readonly ApplicationCheck[];
	// nur bei diesen Diensten (sonst N/A)
	services?: readonly CaspService[];
};

export type ApplicationFacts = {
	documents: readonly { templateCode: string | null; status: string }[];
	controls: ReadonlyMap<string, ImplStatus>;
	functions: ReadonlySet<RoleFunction>;
	ownFundsApproved: boolean;
	amlAnalysisApproved: boolean;
	providers: readonly { isOutsourcing: boolean }[];
	processes: number;
	shareholders: number;
	cryptoAssets: number;
	scopes: ReadonlySet<string>;
	// manuell abgehakte Bestandteile (Code)
	manualDone: ReadonlySet<string>;
};

export type CheckStatus = "done" | "partial" | "open";

export type CheckResult = { check: ApplicationCheck; status: CheckStatus };

export type ApplicationItemResult = {
	item: ApplicationItem;
	status: CheckStatus | "not_applicable";
	checks: CheckResult[];
};

export type ApplicationResult = {
	items: ApplicationItemResult[];
	applicable: number;
	done: number;
	partial: number;
	completenessPct: number | null; // (done + 0,5·partial) / anwendbar
};

const DOC_RANK: Record<string, number> = {
	draft: 0,
	in_review: 1,
	approved: 2,
	published: 3,
	retired: -1,
	superseded: -1,
};

function ratio(hit: number, total: number): CheckStatus {
	if (total === 0) return "open";
	if (hit >= total) return "done";
	return hit > 0 ? "partial" : "open";
}

export function evaluateCheck(
	check: ApplicationCheck,
	facts: ApplicationFacts,
	itemCode: string,
): CheckStatus {
	switch (check.kind) {
		case "documents": {
			const min = DOC_RANK[check.minStatus ?? "approved"] ?? 2;
			let hit = 0;
			let started = 0;
			for (const code of check.templateCodes) {
				const docs = facts.documents.filter((d) => d.templateCode === code);
				if (docs.length === 0) continue;
				started += 1;
				if (docs.some((d) => (DOC_RANK[d.status] ?? 0) >= min)) hit += 1;
			}
			if (hit >= check.templateCodes.length) return "done";
			return started > 0 ? "partial" : "open";
		}
		case "controls": {
			let implemented = 0;
			let started = 0;
			for (const code of check.codes) {
				const s = facts.controls.get(code);
				if (s === "implemented" || s === "not_applicable") implemented += 1;
				else if (s === "in_progress" || s === "planned") started += 1;
			}
			if (implemented >= check.codes.length) return "done";
			return implemented + started > 0 ? "partial" : "open";
		}
		case "functions": {
			const hit = check.functions.filter((f) => facts.functions.has(f)).length;
			return ratio(hit, check.functions.length);
		}
		case "own_funds":
			return facts.ownFundsApproved ? "done" : "open";
		case "aml_risk_analysis":
			return facts.amlAnalysisApproved ? "done" : "open";
		case "providers": {
			const list =
				check.filter === "outsourcing"
					? facts.providers.filter((p) => p.isOutsourcing)
					: facts.providers;
			return list.length > 0 ? "done" : "open";
		}
		case "processes":
			return facts.processes >= (check.min ?? 1) ? "done" : "open";
		case "shareholders":
			return facts.shareholders > 0 ? "done" : "open";
		case "crypto_assets":
			return facts.cryptoAssets > 0 ? "done" : "open";
		case "scope":
			return facts.scopes.has(check.framework) ? "done" : "open";
		case "manual":
			return facts.manualDone.has(itemCode) ? "done" : "open";
	}
}

export function evaluateApplication(
	items: readonly ApplicationItem[],
	facts: ApplicationFacts,
	services: readonly CaspService[] = [],
): ApplicationResult {
	const offered = new Set(services);
	const results: ApplicationItemResult[] = items.map((item) => {
		if (item.services && !item.services.some((s) => offered.has(s))) {
			return { item, status: "not_applicable", checks: [] };
		}
		const checks = item.checks.map((check) => ({
			check,
			status: evaluateCheck(check, facts, item.code),
		}));
		const done = checks.filter((c) => c.status === "done").length;
		const partial = checks.filter((c) => c.status === "partial").length;
		const status: CheckStatus =
			done === checks.length ? "done" : done + partial > 0 ? "partial" : "open";
		return { item, status, checks };
	});
	const applicableItems = results.filter((r) => r.status !== "not_applicable");
	const done = applicableItems.filter((r) => r.status === "done").length;
	const partial = applicableItems.filter((r) => r.status === "partial").length;
	return {
		items: results,
		applicable: applicableItems.length,
		done,
		partial,
		completenessPct:
			applicableItems.length === 0
				? null
				: Math.round(((done + 0.5 * partial) / applicableItems.length) * 1000) /
					10,
	};
}
