import { describe, expect, it } from "vitest";
import {
	DEFAULT_IDENTITY_POLICY,
	type IdentityPolicy,
	identityPolicyOf,
	identityPolicyRelaxed,
} from "@/lib/identity/policy";

// Teil D: Schwellen je Org. Streng gelesen, Lockern erkannt.

const D = DEFAULT_IDENTITY_POLICY;

describe("identityPolicyOf", () => {
	it("liefert ohne gespeicherten Wert den Standard", () => {
		expect(identityPolicyOf(null)).toEqual(D);
		expect(identityPolicyOf(undefined)).toEqual(D);
		expect(identityPolicyOf("95")).toEqual(D);
		expect(identityPolicyOf([1, 2])).toEqual(D);
		expect(identityPolicyOf({})).toEqual(D);
	});

	it("übernimmt gültige Werte", () => {
		const stored: IdentityPolicy = {
			mfaFailBelow: 80,
			maxTopAdmins: 2,
			leaverGraceDays: 0,
			inactiveDays: 60,
			neverSignedInDays: 14,
			recertPassDays: 180,
			recertFailDays: 365,
			staleHours: 72,
		};
		expect(identityPolicyOf(stored)).toEqual(stored);
	});

	it("nimmt die Grenzen selbst noch an", () => {
		const low = identityPolicyOf({
			mfaFailBelow: 50,
			maxTopAdmins: 1,
			leaverGraceDays: 0,
			inactiveDays: 30,
			neverSignedInDays: 7,
			recertPassDays: 30,
			recertFailDays: 30,
		});
		expect(low).toMatchObject({
			mfaFailBelow: 50,
			maxTopAdmins: 1,
			leaverGraceDays: 0,
			inactiveDays: 30,
			neverSignedInDays: 7,
			recertPassDays: 30,
			recertFailDays: 30,
		});
		const high = identityPolicyOf({
			mfaFailBelow: 100,
			maxTopAdmins: 20,
			leaverGraceDays: 30,
			inactiveDays: 365,
			neverSignedInDays: 180,
			recertPassDays: 365,
			recertFailDays: 730,
		});
		expect(high).toMatchObject({
			mfaFailBelow: 100,
			maxTopAdmins: 20,
			leaverGraceDays: 30,
			inactiveDays: 365,
			neverSignedInDays: 180,
			recertPassDays: 365,
			recertFailDays: 730,
		});
	});

	it("setzt je Feld den Standard bei Werten außerhalb der Grenzen", () => {
		const p = identityPolicyOf({
			mfaFailBelow: 49,
			maxTopAdmins: 21,
			leaverGraceDays: -1,
			inactiveDays: 366,
			neverSignedInDays: 6,
			recertPassDays: 29,
			recertFailDays: 731,
		});
		expect(p).toEqual(D);
	});

	it("verwirft Brüche, Texte, NaN und Unendlich", () => {
		const p = identityPolicyOf({
			mfaFailBelow: 90.5,
			maxTopAdmins: "3",
			leaverGraceDays: Number.NaN,
			inactiveDays: null,
			neverSignedInDays: true,
			recertPassDays: Number.POSITIVE_INFINITY,
		});
		expect(p).toEqual(D);
	});

	it("behält gültige Felder neben ungültigen", () => {
		const p = identityPolicyOf({ mfaFailBelow: 80, maxTopAdmins: 0 });
		expect(p.mfaFailBelow).toBe(80);
		expect(p.maxTopAdmins).toBe(D.maxTopAdmins);
	});

	it("setzt beide Rezertifizierungs-Fristen zurück, wenn „nicht bestanden“ vor „bestanden“ läge", () => {
		const p = identityPolicyOf({ recertPassDays: 200, recertFailDays: 150 });
		expect(p.recertPassDays).toBe(D.recertPassDays);
		expect(p.recertFailDays).toBe(D.recertFailDays);
		// gleiche Frist ist erlaubt
		const same = identityPolicyOf({ recertPassDays: 100, recertFailDays: 100 });
		expect(same.recertPassDays).toBe(100);
		expect(same.recertFailDays).toBe(100);
		// gültige Bestehensfrist über dem Standard der Fehlfrist: beide Standard
		const passOnly = identityPolicyOf({ recertPassDays: 200 });
		expect(passOnly.recertPassDays).toBe(D.recertPassDays);
		expect(passOnly.recertFailDays).toBe(D.recertFailDays);
	});

	it("hält den Abgleich-Zeitraum fest bei 72 Stunden", () => {
		expect(identityPolicyOf({ staleHours: 1000 }).staleHours).toBe(72);
		expect(identityPolicyOf({ staleHours: 24 }).staleHours).toBe(72);
	});
});

describe("identityPolicyRelaxed", () => {
	it("erkennt keine Lockerung bei gleichen oder strengeren Werten", () => {
		expect(identityPolicyRelaxed(D, D)).toBe(false);
		expect(
			identityPolicyRelaxed(D, {
				...D,
				mfaFailBelow: 99,
				maxTopAdmins: 2,
				leaverGraceDays: 1,
				inactiveDays: 60,
				neverSignedInDays: 14,
				recertPassDays: 60,
				recertFailDays: 90,
			}),
		).toBe(false);
	});

	it.each([
		["mfaFailBelow", { mfaFailBelow: 90 }],
		["maxTopAdmins", { maxTopAdmins: 5 }],
		["leaverGraceDays", { leaverGraceDays: 4 }],
		["inactiveDays", { inactiveDays: 91 }],
		["neverSignedInDays", { neverSignedInDays: 31 }],
		["recertPassDays", { recertPassDays: 91 }],
		["recertFailDays", { recertFailDays: 121 }],
	] as const)("erkennt Lockerung bei %s", (_, change) => {
		expect(identityPolicyRelaxed(D, { ...D, ...change })).toBe(true);
	});

	it("zählt eine Lockerung auch neben Verschärfungen", () => {
		expect(
			identityPolicyRelaxed(D, { ...D, mfaFailBelow: 100, maxTopAdmins: 6 }),
		).toBe(true);
	});
});
