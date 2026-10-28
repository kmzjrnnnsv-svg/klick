import { orgSettings } from "@/db/schema";
import {
	type InitializeOrgSummary,
	initializeOrg,
} from "@/lib/compliance/initialize-org";
import {
	appetiteFromMethod,
	defaultRiskMethod,
} from "@/lib/compliance/risk-method";
import { generateDek, wrapDek } from "@/lib/crypto/envelope";
import type { OrgTx } from "@/lib/db/with-org";
import { SETUP_FLAG } from "@/lib/setup/steps";

// Grundausstattung einer leeren Organisation ohne Rahmenwerke: Einstellungen
// mit eigenem Schlüssel (DEK), Vorlage der Risikomethode, Start der
// geführten Einrichtung. Für „Organisation anlegen“ (Admin-Portal) und
// „Neu beginnen“ (Einstellungen > Organisation); das Onboarding setzt
// zusätzlich Sektor, Stufe und Rahmenwerke selbst.
export async function seedEmptyOrg(
	tx: OrgTx,
	input: {
		orgId: string;
		/** Verantwortliche:r für neue Einträge; null = noch niemand */
		userId: string | null;
		priceGroupId?: string | null;
		/** weitere Merker (z. B. übernommene Zustimmung) */
		flags?: Record<string, string>;
	},
): Promise<{ keyVersion: number; init: InitializeOrgSummary }> {
	const wrapped = await wrapDek(await generateDek());
	const method = defaultRiskMethod([]);
	const now = new Date();
	await tx.insert(orgSettings).values({
		organizationId: input.orgId,
		encryptedDek: wrapped.wrapped,
		keyVersion: wrapped.keyVersion,
		riskMethod: method,
		riskAppetite: appetiteFromMethod(method),
		onboardingCompletedAt: now,
		priceGroupId: input.priceGroupId ?? null,
		setupFlags: {
			...(input.flags ?? {}),
			[SETUP_FLAG.started]: now.toISOString(),
		},
	});
	const init = await initializeOrg(tx, {
		orgId: input.orgId,
		userId: input.userId,
		frameworks: [],
		sector: "other",
		licenceStage: "0_vorbereitung",
		caspServices: [],
		applyBaseline: false,
	});
	return { keyVersion: wrapped.keyVersion, init };
}
