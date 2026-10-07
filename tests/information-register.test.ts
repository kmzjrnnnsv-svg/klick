import { describe, expect, it } from "vitest";
import {
	buildInformationRegister,
	contractReference,
	ICT_SERVICE_TYPE,
	providerIdentifier,
	type RegisterFunction,
	type RegisterProvider,
	registerReadme,
} from "@/lib/export/information-register";

const entity = {
	name: "Klick Payments GmbH",
	lei: "5299000HVJYR6QP3DK12",
	country: "DE",
	sector: "casp" as const,
	competentAuthority: null,
	currency: "EUR",
	totalAssets: 1_250_000,
	reportingDate: "2027-03-15",
};

const hetzner: RegisterProvider = {
	id: "11111111-2222-3333-4444-555555555555",
	name: "Hetzner Online GmbH",
	lei: null,
	country: "DE",
	isIct: true,
	isIntraGroup: false,
	status: "active",
	serviceType: "hosting",
	serviceDescription: "Dedicated Server, Object Storage",
	criticality: "critical",
	substitutability: "difficult",
	dataLocations: ["DE", "FI"],
	subcontractors: [{ name: "Hetzner Finland Oy", country: "FI" }],
	contractRef: "HZ-2026-01",
	contractStart: "2026-01-01",
	contractEnd: null,
	noticePeriodDays: 30,
	exitStrategy:
		"Terraform-Rebuild bei zweitem Anbieter, Restore aus Offsite-Backup",
	lastAssessmentAt: "2026-09-01",
	processesPersonalData: true,
};

const brevo: RegisterProvider = {
	...hetzner,
	id: "66666666-7777-8888-9999-000000000000",
	name: "Brevo",
	serviceType: "cloud_saas",
	criticality: "standard",
	substitutability: "easy",
	dataLocations: [],
	subcontractors: [],
	contractRef: null,
	exitStrategy: null,
	processesPersonalData: true,
};

const bank: RegisterProvider = {
	...brevo,
	id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
	name: "Partnerbank AG",
	isIct: false,
	serviceType: "payment",
};

const functions: RegisterFunction[] = [
	{
		code: "P-01",
		name: "Zahlungsannahme",
		status: "active",
		criticality: "critical",
		rtoHours: 4,
		rpoHours: 1,
		impactNotes: "Kein Zahlungseingang für Händler",
		reviewAt: "2026-09-30",
		updatedAt: new Date("2026-08-01T00:00:00Z"),
	},
	{
		code: "P-09",
		name: "Schulung",
		status: "active",
		criticality: "standard",
		rtoHours: null,
		rpoHours: null,
		impactNotes: null,
		reviewAt: null,
		updatedAt: new Date("2026-08-02T00:00:00Z"),
	},
	{
		code: "P-99",
		name: "Alt",
		status: "retired",
		criticality: "critical",
		rtoHours: null,
		rpoHours: null,
		impactNotes: null,
		reviewAt: null,
		updatedAt: new Date("2026-08-02T00:00:00Z"),
	},
];

describe("Informationsregister ITS 2024/2956", () => {
	const out = buildInformationRegister({
		entity,
		providers: [hetzner, brevo, bank],
		functions,
		links: [
			{ processCode: "P-01", providerId: hetzner.id },
			{ processCode: "P-99", providerId: hetzner.id },
		],
	});
	const tpl = (code: string) => {
		const t = out.templates.find((x) => x.code === code);
		if (!t) throw new Error(code);
		return t;
	};

	it("liefert alle 14 Bögen mit Spaltencodes c0010…", () => {
		expect(out.templates.map((t) => t.code)).toEqual([
			"B_01.01",
			"B_01.02",
			"B_01.03",
			"B_02.01",
			"B_02.02",
			"B_02.03",
			"B_03.01",
			"B_03.02",
			"B_03.03",
			"B_04.01",
			"B_05.01",
			"B_05.02",
			"B_06.01",
			"B_07.01",
		]);
		for (const t of out.templates) {
			expect(t.columns[0]?.code).toBe("c0010");
			for (const r of t.rows) expect(r).toHaveLength(t.columns.length);
		}
	});

	it("B_01: Einheit mit LEI, Land, Art, Behörde BaFin, Bilanzsumme", () => {
		expect(tpl("B_01.01").rows[0]).toEqual([
			entity.lei,
			entity.name,
			"DE",
			"Anbieter von Kryptowerte-Dienstleistungen",
			"BaFin",
			"2027-03-15",
		]);
		expect(tpl("B_01.02").rows[0]?.[10]).toBe("1250000");
	});

	it("nur IKT-Dienstleister; Bank fällt raus; Unterauftragnehmer in B_05.02 Rang 2", () => {
		expect(out.providerCount).toBe(2);
		const names = tpl("B_05.01").rows.map((r) => r[4]);
		expect(names).toEqual([
			"Hetzner Online GmbH",
			"Hetzner Finland Oy",
			"Brevo",
		]);
		const chain = tpl("B_05.02").rows.filter((r) => r[0] === "HZ-2026-01");
		expect(chain.map((r) => r[4])).toEqual(["1", "2"]);
		expect(chain[1]?.[5]).toBe(providerIdentifier(hetzner).code);
	});

	it("B_02.02: Funktion verknüpft, S-Code, Daten DE;FI, Abhängigkeit hoch", () => {
		const rows = tpl("B_02.02").rows.filter((r) => r[0] === "HZ-2026-01");
		expect(rows).toHaveLength(1); // P-99 ist stillgelegt → keine Zeile
		const r = rows[0] as string[];
		expect(r[4]).toBe("F001");
		expect(r[5]).toBe(ICT_SERVICE_TYPE.hosting);
		expect(r[13]).toBe("Ja");
		expect(r[14]).toBe("DE;FI");
		expect(r[17]).toBe("hoch");
		// Brevo ohne Funktion → eine Zeile mit leerer Funktionskennung
		const b = tpl("B_02.02").rows.find(
			(x) => x[0] === contractReference(brevo),
		);
		expect(b?.[4]).toBe("");
		expect(b?.[5]).toBe("S19");
	});

	it("B_06.01: aktive Funktionen, kritisch Ja/Nein, RTO/RPO, Stillgelegte fehlen", () => {
		const rows = tpl("B_06.01").rows;
		expect(rows).toHaveLength(2);
		expect(rows[0]).toEqual([
			"F001",
			"Kryptowerte-Dienstleistungen (MiCAR Titel V)",
			"P-01 Zahlungsannahme",
			entity.lei,
			"Ja",
			"Kein Zahlungseingang für Händler",
			"2026-09-30",
			"4",
			"1",
			"hoch",
		]);
		expect(rows[1]?.[4]).toBe("Nein");
		expect(rows[1]?.[6]).toBe("2026-08-02");
	});

	it("B_07.01: Substituierbarkeit, Ausstiegsplan, letztes Audit", () => {
		const r = tpl("B_07.01").rows[0] as string[];
		expect(r[4]).toBe("schwer substituierbar");
		expect(r[6]).toBe("2026-09-01");
		expect(r[7]).toBe("Ja");
		const b = tpl("B_07.01").rows[1] as string[];
		expect(b[7]).toBe("Nein");
	});

	it("Warnungen nennen Lücken: fehlende LEI/Vertragsreferenz/Funktion, README listet sie", () => {
		expect(out.warnings).toEqual(
			expect.arrayContaining([
				expect.stringContaining("Hetzner Online GmbH: keine LEI/EUID"),
				expect.stringContaining("B_02.01 Brevo: keine Vertragsreferenz"),
				expect.stringContaining("B_02.02 Brevo: keiner Funktion zugeordnet"),
			]),
		);
		expect(out.warnings.some((w) => w.includes("Ausstiegsplan"))).toBe(false);
		const readme = registerReadme(out, entity.name);
		expect(readme).toContain("B_06.01 — Funktionen (2 Zeilen)");
		expect(readme).toContain("- `c0180` Grad der Abhängigkeit");
		expect(readme).toContain("Brevo: keine Vertragsreferenz");
	});

	it("ohne LEI und ohne Daten: Warnungen statt Absturz", () => {
		const empty = buildInformationRegister({
			entity: { ...entity, lei: null, totalAssets: null },
			providers: [],
			functions: [],
			links: [],
		});
		expect(empty.warnings).toEqual(
			expect.arrayContaining([
				expect.stringContaining("LEI der Organisation fehlt"),
				expect.stringContaining("Bilanzsumme fehlt"),
				expect.stringContaining("keine Prozesse/Funktionen"),
				expect.stringContaining("keine IKT-Dienstleister"),
			]),
		);
		expect(empty.templates.find((t) => t.code === "B_02.02")?.rows).toEqual([]);
	});
});
