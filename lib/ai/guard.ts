import type { Classification } from "@/db/schema/enums";
import type { DlpCategory } from "@/lib/dlp/detectors";
import {
	type AiAdmin,
	type AiFeature,
	type AiPolicy,
	aiPolicyComplete,
	classAllowed,
	FILE_PROVIDERS,
} from "./policy";

// Darf diese KI-Anfrage raus? (Teil B, ADR-032) — rein, an jeder Stelle
// vor dem Senden. Ein Grund je Ablehnung, damit die Oberfläche ehrlich sagt,
// woran es liegt.

export type AiDenied =
	| "ai_off_admin"
	| "ai_off"
	| "ai_incomplete"
	| "feature_off"
	| "secret_never"
	| "class_too_high"
	| "file_not_allowed"
	| "file_unsupported"
	| "dlp_blocked";

export type AiItem = {
	// Einstufung der Inhalte; Hilfe-Fragen ohne Firmendaten: null
	classification: Classification | null;
	// Datei geht selbst an die KI (Modus „KI vergleicht auch“)
	file?: { dlpCategories: readonly DlpCategory[] } | null;
};

// Dateien mit diesen DLP-Treffern gehen nie als Datei raus (Text wird
// geschwärzt, eine Datei nicht)
const FILE_BLOCK: readonly DlpCategory[] = ["secret", "payment", "bank"];

export function aiDecision(
	admin: AiAdmin,
	policy: AiPolicy,
	feature: AiFeature,
	item: AiItem,
): { ok: true } | { ok: false; reason: AiDenied } {
	if (!admin.enabled) return { ok: false, reason: "ai_off_admin" };
	if (!policy.enabled) return { ok: false, reason: "ai_off" };
	if (!aiPolicyComplete(policy)) return { ok: false, reason: "ai_incomplete" };
	if (!policy.features.includes(feature))
		return { ok: false, reason: "feature_off" };
	if (item.classification === "secret")
		return { ok: false, reason: "secret_never" };
	if (item.classification && !classAllowed(item.classification, admin, policy))
		return { ok: false, reason: "class_too_high" };
	if (item.file) {
		if (admin.mode !== "full") return { ok: false, reason: "file_not_allowed" };
		if (!policy.provider || !FILE_PROVIDERS.includes(policy.provider))
			return { ok: false, reason: "file_unsupported" };
		if (item.file.dlpCategories.some((c) => FILE_BLOCK.includes(c)))
			return { ok: false, reason: "dlp_blocked" };
	}
	return { ok: true };
}

// Für die Oberfläche: Knopf zeigen? (ohne Inhalt geprüft)
export function aiFeatureAvailable(
	admin: AiAdmin,
	policy: AiPolicy,
	feature: AiFeature,
): boolean {
	return aiDecision(admin, policy, feature, { classification: null }).ok;
}
