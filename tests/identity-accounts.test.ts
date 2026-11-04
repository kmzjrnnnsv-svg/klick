import { describe, expect, it } from "vitest";
import {
	accountFilterOf,
	accountFlags,
	accountsHref,
	missingCapabilities,
} from "@/lib/identity/accounts";
import { DEFAULT_IDENTITY_POLICY } from "@/lib/identity/policy";

// Teil D, I1b: Filter der Kontenliste über die URL und Kennzeichen je Konto

describe("accountFilterOf", () => {
	it("liest Schalter, Stand, Person, Prüfung und Suche", () => {
		expect(
			accountFilterOf({
				ohne_mfa: "1",
				admins: "1",
				gaeste: "0",
				status: "aktiv",
				person: "ohne",
				pruefung: "mfa",
				q: "  anna ",
			}),
		).toEqual({
			chips: ["ohne_mfa", "admins"],
			state: "aktiv",
			match: "ohne",
			check: "mfa",
			q: "anna",
		});
	});

	it("verwirft Unbekanntes", () => {
		expect(
			accountFilterOf({ status: "x", pruefung: "evil", person: "?", q: "" }),
		).toEqual({ chips: [], state: null, match: null, check: null, q: null });
	});

	it("Link mit Filter", () => {
		expect(accountsHref()).toBe("/team/konten");
		expect(accountsHref({ check: "leavers" })).toBe(
			"/team/konten?pruefung=leavers",
		);
		expect(accountsHref({ chips: ["ohne_mfa", "admins"] })).toBe(
			"/team/konten?ohne_mfa=1&admins=1",
		);
	});
});

describe("accountFlags", () => {
	const now = new Date("2026-11-04T10:00:00Z");
	const base = {
		enabled: true,
		kind: "member" as const,
		lastSignInAt: new Date("2026-11-01T10:00:00Z"),
		createdAtSource: new Date("2025-01-01T00:00:00Z"),
		leaveAt: null,
		markedLeftAt: null,
		missingSince: null,
	};

	it("aktiv und angemeldet: kein Kennzeichen", () => {
		expect(accountFlags(base, now, DEFAULT_IDENTITY_POLICY)).toEqual({
			left: false,
			inactive: false,
			neverSignedIn: false,
			missing: false,
		});
	});

	it("inaktiv nach der Schwelle, nie angemeldet nur mit Anlagedatum", () => {
		const old = { ...base, lastSignInAt: new Date("2026-06-01T00:00:00Z") };
		expect(accountFlags(old, now, DEFAULT_IDENTITY_POLICY).inactive).toBe(true);
		const never = { ...base, lastSignInAt: null };
		expect(
			accountFlags(never, now, DEFAULT_IDENTITY_POLICY).neverSignedIn,
		).toBe(true);
		expect(
			accountFlags(
				{ ...never, createdAtSource: null },
				now,
				DEFAULT_IDENTITY_POLICY,
			).neverSignedIn,
		).toBe(false);
	});

	it("ausgeschieden: markiert oder Austrittsdatum erreicht, nicht vorher", () => {
		expect(
			accountFlags({ ...base, markedLeftAt: now }, now, DEFAULT_IDENTITY_POLICY)
				.left,
		).toBe(true);
		expect(
			accountFlags(
				{ ...base, leaveAt: new Date("2026-12-01T00:00:00Z") },
				now,
				DEFAULT_IDENTITY_POLICY,
			).left,
		).toBe(false);
	});

	it("fehlende Fähigkeiten", () => {
		expect(missingCapabilities(null)).toEqual([]);
		expect(
			missingCapabilities({
				signIn: false,
				mfa: true,
				roles: true,
				leaveDate: false,
			}),
		).toEqual(["signIn", "leaveDate"]);
	});
});
