import { ACCESS_REQUEST_PURPOSES } from "@wallet/db/schema/enums";
import {
	ACCESS_REQUEST_MIN_FILL_MS,
	looksAutomated,
	PURPOSE_LABEL,
} from "@wallet/lib/access-requests/rules";
import { accessRequestSchema } from "@wallet/lib/validation/access-request";
import { describe, expect, it } from "vitest";

// „Zugang anfragen“ (rein): Bot-Abwehr und Eingabeprüfung

const valid = {
	name: "Alex Muster",
	company: "Muster GmbH",
	email: "  Alex@Example.org ",
	purpose: "own",
	message: "",
	business: true,
	website: "",
	renderedAt: 0,
};

describe("Zugang anfragen", () => {
	it("verwirft Honeypot, fehlenden Zeitstempel und zu schnelles Ausfüllen", () => {
		const now = 1_000_000;
		expect(looksAutomated({ website: "x", renderedAt: 0 }, now)).toBe(true);
		expect(looksAutomated({ renderedAt: null }, now)).toBe(true);
		expect(looksAutomated({ renderedAt: Number.NaN }, now)).toBe(true);
		expect(looksAutomated({ renderedAt: now - 500 }, now)).toBe(true);
		// Zeitstempel aus der Zukunft
		expect(looksAutomated({ renderedAt: now + 60_000 }, now)).toBe(true);
		expect(
			looksAutomated({ renderedAt: now - ACCESS_REQUEST_MIN_FILL_MS }, now),
		).toBe(false);
	});

	it("nimmt gültige Angaben an und normalisiert die Adresse", () => {
		const r = accessRequestSchema.safeParse(valid);
		expect(r.success).toBe(true);
		if (r.success) {
			expect(r.data.email).toBe("alex@example.org");
			expect(r.data.message).toBeNull();
		}
	});

	it("verlangt Unternehmen, Zweck aus der Liste und die Bestätigung", () => {
		expect(
			accessRequestSchema.safeParse({ ...valid, company: "" }).success,
		).toBe(false);
		expect(
			accessRequestSchema.safeParse({ ...valid, purpose: "trading" }).success,
		).toBe(false);
		expect(
			accessRequestSchema.safeParse({ ...valid, business: false }).success,
		).toBe(false);
		expect(
			accessRequestSchema.safeParse({ ...valid, email: "kein-mail" }).success,
		).toBe(false);
		expect(
			accessRequestSchema.safeParse({ ...valid, message: "x".repeat(2_001) })
				.success,
		).toBe(false);
	});

	it("hat für jeden Zweck einen Text", () => {
		for (const p of ACCESS_REQUEST_PURPOSES)
			expect(PURPOSE_LABEL[p].length).toBeGreaterThan(5);
		// Ziel und Bot sind als solche gekennzeichnet, nie als Angebot
		expect(PURPOSE_LABEL.payments).toMatch(/Ziel.*Erlaubnis/);
		expect(PURPOSE_LABEL.bot).toMatch(/geplant/);
	});
});
