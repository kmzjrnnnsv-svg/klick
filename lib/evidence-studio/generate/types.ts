import type { OrgTx } from "@/lib/db/with-org";
import type { DocBlock } from "@/lib/export/doc-model";

// Ein Generator je Nachweisart: `load` liest die Registerdaten der Org
// (Namen schon aufgelöst, keine feldverschlüsselten Inhalte — der
// Schnappschuss liegt unverschlüsselt in evidence.snapshot), `build` macht
// daraus pure die Abschnitte des Dokuments. Kopf, „Belegt“, Unterschriften
// und Fuß ergänzt assembleDoc.
export type Generator<F = unknown> = {
	code: string;
	load(tx: OrgTx, orgId: string, entityId?: string): Promise<F | null>;
	// `today` (Berlin, ISO) nur für Stichtagsangaben wie „überfällig“ — nicht
	// Teil des Schnappschusses, sonst wäre jeder Nachweis am Folgetag veraltet
	build(
		facts: F,
		ctx: { today: string },
	): { title?: string; subtitle?: string; blocks: DocBlock[] };
	// zählt Nachweise anderer Arten (z. B. SoA) → beim Sammelerzeugen zuletzt,
	// sonst wäre sie sofort wieder veraltet
	dependsOnEvidence?: boolean;
	// je Datensatz (scope per_entity): wählbare Datensätze
	entities?(tx: OrgTx, orgId: string): Promise<{ id: string; label: string }[]>;
};

// Typ-Hilfe: Generator mit eigenen Fakten in die Registry legen
export const generator = <F>(g: Generator<F>): Generator<unknown> =>
	g as Generator<unknown>;
