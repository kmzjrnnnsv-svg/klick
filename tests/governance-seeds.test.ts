import { describe, expect, it } from "vitest";
import { ROLE_FUNCTIONS } from "@/db/schema/enums";
import { CONTROL_BY_CODE, FRAMEWORK_BY_SLUG } from "@/lib/compliance/catalog";
import {
	applicableCommunications,
	applicableParties,
	COMMUNICATIONS,
	INTERESTED_PARTIES,
} from "@/lib/compliance/catalog/interested-parties";
import { OBLIGATION_BY_CODE } from "@/lib/compliance/catalog/obligations";
import {
	applicableProcesses,
	PROCESSES,
	raciValid,
} from "@/lib/compliance/catalog/processes";
import { REQUIRED_FUNCTIONS } from "@/lib/compliance/catalog/required-functions";
import { REQUIRED_RESOLUTIONS } from "@/lib/compliance/catalog/resolutions-required";

const fns = new Set<string>(ROLE_FUNCTIONS);

describe("Prozesslandkarte", () => {
	it("Codes eindeutig, genau ein A je Prozess, Controls und Funktionen auflösbar", () => {
		expect(new Set(PROCESSES.map((p) => p.code)).size).toBe(PROCESSES.length);
		for (const p of PROCESSES) {
			expect(raciValid(p.raci).ok, `${p.code} RACI`).toBe(true);
			for (const r of p.raci)
				expect(fns.has(r.function), `${p.code} ${r.function}`).toBe(true);
			for (const c of p.controls)
				expect(CONTROL_BY_CODE.has(c), `${p.code} ${c}`).toBe(true);
			if (p.criticality === "critical")
				expect(p.rtoHours, `${p.code} RTO`).toBeDefined();
			for (const f of p.requires ?? [])
				expect(FRAMEWORK_BY_SLUG.has(f), `${p.code} requires ${f}`).toBe(true);
		}
	});
	it("ISO-only-Org bekommt die rahmenwerksneutralen Prozesse, keine Zahlungs-/AML-Prozesse", () => {
		const codes = applicableProcesses(["iso27001"]).map((p) => p.code);
		expect(codes).toContain("P-09");
		expect(codes).toContain("P-16");
		expect(codes).not.toContain("P-01");
		expect(codes).not.toContain("P-06");
	});
	it("CASP-Org bekommt alle 20 Prozesse", () => {
		expect(
			applicableProcesses([
				"iso27001",
				"dora",
				"micar",
				"zag",
				"zag-marisk",
				"gwg",
				"dac8",
				"awv",
				"tfr",
				"sanctions",
			]),
		).toHaveLength(PROCESSES.length);
	});
	it("raciValid erkennt null oder zwei A", () => {
		expect(raciValid([{ raci: "R" }]).ok).toBe(false);
		expect(raciValid([{ raci: "A" }, { raci: "A" }]).ok).toBe(false);
	});
});

describe("Parteien und Kommunikation", () => {
	it("Parteien eindeutig und mit Rahmenwerken; Kommunikationen verweisen auf bekannte Parteien, Funktionen und Pflichten", () => {
		expect(new Set(INTERESTED_PARTIES.map((p) => p.key)).size).toBe(
			INTERESTED_PARTIES.length,
		);
		const partyKeys = new Set(INTERESTED_PARTIES.map((p) => p.key));
		for (const p of INTERESTED_PARTIES)
			for (const f of p.relevantFrameworks)
				expect(FRAMEWORK_BY_SLUG.has(f), f).toBe(true);
		for (const c of COMMUNICATIONS) {
			if (c.partyKey) expect(partyKeys.has(c.partyKey), c.key).toBe(true);
			expect(fns.has(c.ownerFunction), c.key).toBe(true);
			if (c.obligationCode)
				expect(OBLIGATION_BY_CODE.has(c.obligationCode), c.key).toBe(true);
		}
	});
	it("Krisenkontakte existieren für DORA-Orgs; ISO-only ohne BaFin-Meldeweg", () => {
		const crisis = applicableCommunications(["dora", "zag", "micar"]).filter(
			(c) => c.trigger === "crisis",
		);
		expect(crisis.length).toBeGreaterThanOrEqual(2);
		expect(
			applicableCommunications(["iso27001"]).some(
				(c) => c.key === "incident-bafin",
			),
		).toBe(false);
		expect(applicableParties(["iso27001"]).some((p) => p.key === "bafin")).toBe(
			false,
		);
		expect(
			applicableParties(["iso27001"]).some((p) => p.key === "employees"),
		).toBe(true);
	});
});

describe("Pflichtfunktionen und Pflichtbeschlüsse referenzieren Rahmenwerke", () => {
	it("alle Slugs existieren im Katalog", () => {
		for (const f of REQUIRED_FUNCTIONS)
			for (const s of f.frameworks)
				expect(FRAMEWORK_BY_SLUG.has(s), `${f.function} ${s}`).toBe(true);
		for (const r of REQUIRED_RESOLUTIONS)
			for (const s of r.frameworks)
				expect(FRAMEWORK_BY_SLUG.has(s), `${r.code} ${s}`).toBe(true);
		expect(new Set(REQUIRED_RESOLUTIONS.map((r) => r.code)).size).toBe(
			REQUIRED_RESOLUTIONS.length,
		);
	});
});
