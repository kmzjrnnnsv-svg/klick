import { describe, expect, it } from "vitest";
import { aiDecision, aiFeatureAvailable } from "@/lib/ai/guard";
import {
	AI_POLICY_OFF,
	type AiAdmin,
	type AiPolicy,
	aiAdminOf,
	aiPolicyComplete,
	aiPolicyOf,
	aiPolicyRelaxed,
	classAllowed,
} from "@/lib/ai/policy";
import { redactText } from "@/lib/dlp/redact";

const admin: AiAdmin = { enabled: true, mode: "assist", maxClass: "internal" };
const policy: AiPolicy = {
	...AI_POLICY_OFF,
	enabled: true,
	maxClass: "confidential",
	features: ["compare", "help"],
	provider: "anthropic",
	model: "claude-sonnet-5-5",
	credentialId: "00000000-0000-4000-8000-000000000001",
	dpaConfirmedAt: "2026-10-29T08:00:00.000Z",
	dpaConfirmedBy: "u1",
};

describe("KI-Regeln je Organisation", () => {
	it("liest gespeicherte Werte, Unlesbares ist aus", () => {
		expect(aiPolicyOf(null)).toEqual(AI_POLICY_OFF);
		expect(aiPolicyOf({ enabled: "ja" })).toEqual(AI_POLICY_OFF);
		expect(aiPolicyOf({ enabled: true, maxClass: "internal" }).maxClass).toBe(
			"internal",
		);
		expect(aiAdminOf(null).enabled).toBe(false);
		expect(
			aiAdminOf({ aiEnabled: true, aiMode: "x", aiMaxClass: "y" }),
		).toEqual({ enabled: true, mode: "assist", maxClass: "none" });
	});

	it("Obergrenze: das Strengere aus Admin und Org, streng geheim nie", () => {
		expect(classAllowed("internal", admin, policy)).toBe(true);
		expect(classAllowed("confidential", admin, policy)).toBe(false);
		expect(
			classAllowed(
				"confidential",
				{ ...admin, maxClass: "confidential" },
				policy,
			),
		).toBe(true);
		expect(
			classAllowed("secret", { ...admin, maxClass: "confidential" }, policy),
		).toBe(false);
	});

	it("vollständig erst mit Anbieter, Modell, Schlüssel und AV-Bestätigung", () => {
		expect(aiPolicyComplete(policy)).toBe(true);
		expect(aiPolicyComplete({ ...policy, dpaConfirmedAt: null })).toBe(false);
		expect(aiPolicyComplete({ ...policy, provider: "azure_openai" })).toBe(
			false,
		);
		expect(
			aiPolicyComplete({
				...policy,
				provider: "azure_openai",
				endpoint: "firma.openai.azure.com",
				deployment: "gpt",
			}),
		).toBe(true);
	});

	it("Lockern verlangt Vier-Augen, Verschärfen nicht", () => {
		expect(aiPolicyRelaxed(AI_POLICY_OFF, policy)).toContain("enabled");
		expect(aiPolicyRelaxed(policy, { ...policy, enabled: false })).toEqual([]);
		expect(aiPolicyRelaxed(policy, { ...policy, maxClass: "public" })).toEqual(
			[],
		);
		expect(
			aiPolicyRelaxed(
				{ ...policy, maxClass: "internal" },
				{ ...policy, maxClass: "confidential" },
			),
		).toEqual(["maxClass"]);
		expect(
			aiPolicyRelaxed(policy, { ...policy, features: ["compare"] }),
		).toEqual([]);
		expect(
			aiPolicyRelaxed(policy, { ...policy, features: ["compare", "draft"] }),
		).toEqual(["features"]);
		expect(
			aiPolicyRelaxed(policy, {
				...policy,
				credentialId: "00000000-0000-4000-8000-000000000002",
			}),
		).toEqual(["credential"]);
		expect(
			aiPolicyRelaxed(policy, { ...policy, model: "claude-opus-5-5" }),
		).toEqual([]);
	});
});

describe("KI-Prüfung vor dem Senden", () => {
	const ask = (
		a: AiAdmin,
		p: AiPolicy,
		item: Parameters<typeof aiDecision>[3],
		feature: Parameters<typeof aiDecision>[2] = "compare",
	) => {
		const r = aiDecision(a, p, feature, item);
		return r.ok ? "ok" : r.reason;
	};

	it("jeder Grund", () => {
		const internal = { classification: "internal" as const };
		expect(ask({ ...admin, enabled: false }, policy, internal)).toBe(
			"ai_off_admin",
		);
		expect(ask(admin, { ...policy, enabled: false }, internal)).toBe("ai_off");
		expect(ask(admin, { ...policy, credentialId: null }, internal)).toBe(
			"ai_incomplete",
		);
		expect(ask(admin, policy, internal, "draft")).toBe("feature_off");
		expect(ask(admin, policy, { classification: "secret" })).toBe(
			"secret_never",
		);
		expect(ask(admin, policy, { classification: "confidential" })).toBe(
			"class_too_high",
		);
		expect(ask(admin, policy, internal)).toBe("ok");
		expect(ask(admin, policy, { classification: null }, "help")).toBe("ok");
	});

	it("Dateien nur im Modus „KI vergleicht auch“, mit Datei-Anbieter, ohne Geheimnisse", () => {
		const file = {
			classification: "internal" as const,
			file: { dlpCategories: [] },
		};
		expect(ask(admin, policy, file)).toBe("file_not_allowed");
		const full = { ...admin, mode: "full" as const };
		expect(ask(full, policy, file)).toBe("ok");
		expect(ask(full, { ...policy, provider: "mistral" }, file)).toBe(
			"file_unsupported",
		);
		expect(
			ask(full, policy, {
				classification: "internal",
				file: { dlpCategories: ["pii", "bank"] },
			}),
		).toBe("dlp_blocked");
	});

	it("Knopf nur, wenn die Funktion an ist", () => {
		expect(aiFeatureAvailable(admin, policy, "compare")).toBe(true);
		expect(aiFeatureAvailable(admin, policy, "evidence_check")).toBe(false);
		expect(
			aiFeatureAvailable({ ...admin, enabled: false }, policy, "help"),
		).toBe(false);
	});
});

describe("Schwärzen vor dem Senden", () => {
	it("ersetzt jeden Fund, zählt je Art, lässt den Rest gleich", () => {
		const text = [
			"IBAN DE89 3704 0044 0532 0130 00 für Zahlungen.",
			"Karte 4111 1111 1111 1111, Steuer-ID 86095742719.",
			"Kontakt: max.muster@beispiel.de, Tel. +49 30 1234567.",
			"Schlüssel sk-ant-api03-" + "a".repeat(90) + " und AKIAIOSFODNN7EXAMPLE.",
			"-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg\n-----END PRIVATE KEY-----",
			"Frist 30 Tage, Version 1.2.",
		].join("\n");
		const r = redactText(text);
		expect(r.text).toContain("[IBAN entfernt]");
		expect(r.text).toContain("[Kartennummer entfernt]");
		expect(r.text).toContain("[Steuer-ID entfernt]");
		expect(r.text).toContain("[E-Mail entfernt]");
		expect(r.text).toContain("[Telefon entfernt]");
		expect(r.text).toContain("[Schlüssel entfernt]");
		expect(r.text).not.toMatch(
			/DE89|4111|86095742719|max\.muster|sk-ant|AKIA|MIIE/,
		);
		expect(r.text).toContain("Frist 30 Tage, Version 1.2.");
		expect(r.counts).toMatchObject({
			iban: 1,
			card_number: 1,
			de_tax_id: 1,
			email: 1,
			phone: 1,
			anthropic_key: 1,
			aws_access_key: 1,
			private_key: 1,
		});
		expect(r.total).toBe(8);
	});

	it("ohne Fund unverändert", () => {
		const r = redactText("Die Leitlinie gilt ab 01.11.2026.");
		expect(r).toEqual({
			text: "Die Leitlinie gilt ab 01.11.2026.",
			counts: {},
			total: 0,
		});
	});
});
