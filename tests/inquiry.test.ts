import { describe, expect, it } from "vitest";
import {
	INQUIRY_MIN_FILL_MS,
	INQUIRY_SERVICE_KEYS,
	inquiryServiceLabel,
	looksAutomated,
} from "@/lib/inquiries/rules";
import { PRICE_ITEMS } from "@/lib/pricing/items";
import {
	appInquirySchema,
	publicInquirySchema,
} from "@/lib/validation/inquiry";

const now = 1_800_000_000_000;
const valid = {
	service: "svc:pentest",
	name: "Erika Muster",
	company: "Beispiel GmbH",
	email: " Erika@Example.org ",
	message: "Pentest der Kunden-App vor dem Go-live.",
	business: true,
	website: "",
	renderedAt: now - 10_000,
};

describe("Anfragen", () => {
	it("Bot-Abwehr: Honeypot, Mindestzeit, fehlender Zeitstempel", () => {
		expect(looksAutomated({ website: "", renderedAt: now - 10_000 }, now)).toBe(
			false,
		);
		expect(
			looksAutomated({ website: "https://x", renderedAt: now - 10_000 }, now),
		).toBe(true);
		expect(
			looksAutomated(
				{ website: "", renderedAt: now - INQUIRY_MIN_FILL_MS + 1 },
				now,
			),
		).toBe(true);
		expect(looksAutomated({ renderedAt: now + 5_000 }, now)).toBe(true);
		expect(looksAutomated({ renderedAt: null }, now)).toBe(true);
	});

	it("Leistungen = Preispositionen + allgemein", () => {
		expect(INQUIRY_SERVICE_KEYS).toEqual([
			...PRICE_ITEMS.map((i) => i.key),
			"general",
		]);
		expect(inquiryServiceLabel("svc:cra")).toBe("CRA-Readiness");
		expect(inquiryServiceLabel("unbekannt")).toBe("unbekannt");
	});

	it("öffentliches Schema: normalisiert, verlangt Einwilligung", () => {
		const ok = publicInquirySchema.safeParse(valid);
		expect(ok.success).toBe(true);
		if (ok.success) {
			expect(ok.data.email).toBe("erika@example.org");
			expect(ok.data.phone).toBeNull();
		}
		// nur für Unternehmen (§ 14 BGB): ohne Bestätigung keine Anfrage
		const noBusiness = publicInquirySchema.safeParse({
			...valid,
			business: false,
		});
		expect(noBusiness.success).toBe(false);
		const { business: _, ...withoutBusiness } = valid;
		expect(publicInquirySchema.safeParse(withoutBusiness).success).toBe(false);
		expect(
			publicInquirySchema.safeParse({ ...valid, service: "svc:x" }).success,
		).toBe(false);
		expect(
			publicInquirySchema.safeParse({ ...valid, message: "kurz" }).success,
		).toBe(false);
	});

	it("App-Schema ohne Kontaktfelder", () => {
		expect(
			appInquirySchema.safeParse({
				service: "general",
				message: "Wechsel auf Wachstum zum Quartal.",
			}).success,
		).toBe(true);
	});
});
