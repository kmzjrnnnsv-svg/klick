import { describe, expect, it } from "vitest";
import {
	emailDomain,
	type MatchAccount,
	type MatchPerson,
	matchAccounts,
} from "@/lib/identity/match";

// Teil D: Konten des Anbieters Personen zuordnen. Nur eindeutig, nur in
// bestätigten Domains, Handzuordnung bleibt.

const acc = (
	id: string,
	email: string | null,
	over: Partial<MatchAccount> = {},
): MatchAccount => ({
	id,
	email,
	kind: "member",
	matchMode: "auto",
	matchedUserId: null,
	...over,
});

const PEOPLE: MatchPerson[] = [
	{ userId: "u-anna", email: "anna@firma.de" },
	{ userId: "u-ben", email: "Ben@Firma.de" },
	{ userId: "u-cem", email: "cem@andere.de" },
];

const run = (
	accounts: MatchAccount[],
	people: MatchPerson[] = PEOPLE,
	verifiedDomains: string[] = ["firma.de"],
) => matchAccounts({ accounts, people, verifiedDomains });

describe("emailDomain", () => {
	it("nimmt den Teil nach dem letzten @, klein geschrieben", () => {
		expect(emailDomain("Anna@Firma.DE")).toBe("firma.de");
		expect(emailDomain('"a@b"@firma.de')).toBe("firma.de");
		expect(emailDomain(" anna@firma.de ")).toBe("firma.de");
	});

	it("liefert null ohne gültige Adresse", () => {
		expect(emailDomain(null)).toBeNull();
		expect(emailDomain("")).toBeNull();
		expect(emailDomain("anna")).toBeNull();
		expect(emailDomain("@firma.de")).toBeNull();
		expect(emailDomain("anna@")).toBeNull();
	});
});

describe("matchAccounts", () => {
	it("ordnet über die exakte Adresse ohne Groß- und Kleinschreibung zu", () => {
		const out = run([acc("a1", "anna@firma.de"), acc("a2", "ben@firma.de")]);
		expect(out.get("a1")).toBe("u-anna");
		expect(out.get("a2")).toBe("u-ben");
	});

	it("liefert für jedes Konto einen Eintrag", () => {
		const out = run([acc("a1", "anna@firma.de"), acc("a2", null)]);
		expect([...out.keys()]).toEqual(["a1", "a2"]);
		expect(out.get("a2")).toBeNull();
	});

	it("ordnet nur in bestätigten Domains zu", () => {
		const out = run([acc("a1", "cem@andere.de")]);
		expect(out.get("a1")).toBeNull();
		const verified = run([acc("a1", "cem@andere.de")], PEOPLE, ["Andere.DE"]);
		expect(verified.get("a1")).toBe("u-cem");
	});

	it("ordnet Gäste nie zu", () => {
		const out = run([acc("g1", "anna@firma.de", { kind: "guest" })]);
		expect(out.get("g1")).toBeNull();
	});

	it("ordnet nicht zu, wenn dieselbe Adresse auf mehreren Konten steht", () => {
		const out = run([
			acc("a1", "anna@firma.de"),
			acc("a2", "ANNA@firma.de"),
			acc("a3", "ben@firma.de"),
		]);
		expect(out.get("a1")).toBeNull();
		expect(out.get("a2")).toBeNull();
		expect(out.get("a3")).toBe("u-ben");
	});

	it("zählt auch von Hand zugeordnete Konten als Doppel", () => {
		const out = run([
			acc("a1", "anna@firma.de", { matchMode: "manual", matchedUserId: "u-x" }),
			acc("a2", "anna@firma.de"),
		]);
		expect(out.get("a1")).toBe("u-x");
		expect(out.get("a2")).toBeNull();
	});

	it("ordnet nicht zu, wenn mehrere Personen dieselbe Adresse haben", () => {
		const people = [...PEOPLE, { userId: "u-anna-2", email: "Anna@firma.de" }];
		const out = run([acc("a1", "anna@firma.de")], people);
		expect(out.get("a1")).toBeNull();
	});

	it("ordnet nicht zu, wenn niemand die Adresse hat", () => {
		expect(run([acc("a1", "dora@firma.de")]).get("a1")).toBeNull();
	});

	it("lässt eine Handzuordnung stehen, auch „niemand“", () => {
		const out = run([
			acc("a1", "anna@firma.de", {
				matchMode: "manual",
				matchedUserId: "u-ben",
			}),
			acc("a2", "ben@firma.de", { matchMode: "manual", matchedUserId: null }),
			acc("g1", "x@fremd.de", {
				kind: "guest",
				matchMode: "manual",
				matchedUserId: "u-cem",
			}),
		]);
		expect(out.get("a1")).toBe("u-ben");
		expect(out.get("a2")).toBeNull();
		expect(out.get("g1")).toBe("u-cem");
	});

	it("rechnet „auto“ und „none“ neu, eine alte Zuordnung zählt nicht", () => {
		const out = run([
			acc("a1", "anna@firma.de", { matchMode: "none" }),
			acc("a2", "dora@firma.de", { matchedUserId: "u-alt" }),
		]);
		expect(out.get("a1")).toBe("u-anna");
		expect(out.get("a2")).toBeNull();
	});
});
