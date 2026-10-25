import { describe, expect, it } from "vitest";
import { ROLE_FUNCTIONS } from "@/db/schema/enums";
import { CATALOG_FRAMEWORKS } from "@/lib/compliance/catalog";
import {
	APPOINTMENT_NOTICES,
	noticesFor,
} from "@/lib/compliance/catalog/appointment-notices";

describe("Anzeigen nach Bestellung", () => {
	const base = {
		event: "appoint" as const,
		stage: "1_agent",
		effectiveFrom: null,
		today: "2026-10-25",
	};

	it("GWB: vorab an die BaFin, Frist = Wirksam ab", () => {
		const [n] = noticesFor({
			...base,
			fn: "aml_officer",
			frameworks: ["gwg"],
			effectiveFrom: "2026-11-01",
		});
		expect(n?.key).toBe("gwg-aml-officer");
		expect(n?.dueAt).toBe("2026-11-01");
		expect(n?.description).toContain("§ 7 Abs. 4 GwG");
	});

	it("vorab, aber Wirksam ab liegt in der Vergangenheit: heute", () => {
		const [n] = noticesFor({
			...base,
			fn: "aml_officer",
			frameworks: ["gwg"],
			effectiveFrom: "2026-01-01",
		});
		expect(n?.dueAt).toBe("2026-10-25");
	});

	it("DSB: binnen 14 Tagen, auch bei Abberufung", () => {
		const [n] = noticesFor({
			...base,
			fn: "dpo",
			event: "revoke",
			frameworks: ["dsgvo"],
		});
		expect(n?.dueAt).toBe("2026-11-08");
		expect(n?.title).toContain("Neue Kontaktdaten");
	});

	it("Geschäftsleitung erst ab Lizenzstufe 2", () => {
		const fws = ["zag", "zag-marisk"];
		expect(
			noticesFor({ ...base, fn: "management_body", frameworks: fws }),
		).toEqual([]);
		expect(
			noticesFor({
				...base,
				fn: "management_body",
				frameworks: fws,
				stage: "2_casp_zag",
			}),
		).toHaveLength(1);
	});

	it("ohne passendes Rahmenwerk keine Anzeige", () => {
		expect(
			noticesFor({ ...base, fn: "dpo", frameworks: ["iso27001"] }),
		).toEqual([]);
		expect(
			noticesFor({ ...base, fn: "isb_ciso", frameworks: ["dsgvo"] }),
		).toEqual([]);
	});

	it("Katalog: nur bekannte Funktionen und Rahmenwerke", () => {
		const slugs = new Set(CATALOG_FRAMEWORKS.map((f) => f.slug));
		for (const n of APPOINTMENT_NOTICES) {
			for (const f of n.functions) expect(ROLE_FUNCTIONS).toContain(f);
			for (const s of n.frameworks) expect(slugs.has(s)).toBe(true);
		}
	});
});
