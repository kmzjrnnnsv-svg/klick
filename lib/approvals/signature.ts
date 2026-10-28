import type { ApprovalStep } from "@/db/schema/grc";

// Posteingang und Freigabe-Leiste: Stufe mit Unterschrift bei einem
// Dokument → „Freigeben und unterschreiben“ statt „Freigeben“.
export function signDocumentOf(r: {
	entityType: string;
	entityId: string;
	currentStep: number;
	steps: readonly ApprovalStep[];
}): string | undefined {
	if (r.entityType !== "document") return undefined;
	return r.steps.find((s) => s.order === r.currentStep)?.signature
		? r.entityId
		: undefined;
}
