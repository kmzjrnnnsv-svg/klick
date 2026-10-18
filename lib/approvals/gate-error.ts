import type { RouteWarning } from "./route";

// Freigabe nicht möglich (niemand kann entscheiden): in mutateOrg werfen,
// damit die gerade angelegte Entität mit zurückgerollt wird; die Action
// fängt den Fehler und meldet den Code.
export class GateBlocked extends Error {
	constructor(
		readonly code: "no_approver" | "solo_reason_required" | "solo_not_allowed",
		readonly warnings: RouteWarning[] = [],
	) {
		super(code);
		this.name = "GateBlocked";
	}
}
