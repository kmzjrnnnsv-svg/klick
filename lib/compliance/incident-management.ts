// Meldungen an die Aufsicht: die Geschäftsleitung wird informiert, nicht
// vorab gefragt (Entscheidung 25.10.2026). Sie bekommt eine Sofort-
// Mitteilung, sobald ein Vorfall meldepflichtig eingestuft (DORA
// schwerwiegend, NIS2 erheblich) oder eine Meldung abgegeben ist, und
// bestätigt die Kenntnisnahme am Vorfall. Pure, getestet.

export const MANAGEMENT_ACK_HOURS = 24;

const REPORTABLE = new Set(["major", "significant"]);

export function informsManagement(classification: string | null): boolean {
	return classification !== null && REPORTABLE.has(classification);
}

export type ManagementAckState = "none" | "open" | "overdue" | "done";

export function managementAckState(
	inc: {
		classification: string | null;
		classifiedAt: Date | string | null;
		managementAcknowledgedAt: Date | string | null;
	},
	now: Date,
): ManagementAckState {
	if (inc.managementAcknowledgedAt) return "done";
	if (!informsManagement(inc.classification) || !inc.classifiedAt)
		return "none";
	const since = now.getTime() - new Date(inc.classifiedAt).getTime();
	return since >= MANAGEMENT_ACK_HOURS * 3_600_000 ? "overdue" : "open";
}
