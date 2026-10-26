import { describe, expect, it } from "vitest";
import {
	CODE_MAX_ATTEMPTS,
	checkCode,
	clampSessionDays,
	codeHash,
	domainAllowed,
	emailDomain,
	normalizeDomain,
	portalSlugValid,
	txtMatches,
	txtRecordValue,
} from "@/lib/policy-portal/rules";

// Richtlinien-Portal (M2): Domain, Code, Sitzungsdauer.

const d = (domain: string, verified: boolean) => ({
	domain,
	token: "t",
	verifiedAt: verified ? "2026-10-26T00:00:00Z" : null,
	via: verified ? ("dns" as const) : null,
});

describe("Domains", () => {
	it("normalisiert Eingaben", () => {
		expect(normalizeDomain("https://Firma.DE/")).toBe("firma.de");
		expect(normalizeDomain(" mail.firma.de. ")).toBe("mail.firma.de");
		expect(normalizeDomain("firma")).toBeNull();
		expect(normalizeDomain("-firma.de")).toBeNull();
		expect(emailDomain("Mara@Firma.de")).toBe("firma.de");
		expect(emailDomain("kein-at")).toBeNull();
	});
	it("nur bestätigte Domains, genau, ohne Unterdomains", () => {
		const domains = [d("firma.de", true), d("offen.de", false)];
		expect(domainAllowed("a@firma.de", domains)).toBe(true);
		expect(domainAllowed("a@offen.de", domains)).toBe(false);
		expect(domainAllowed("a@sub.firma.de", domains)).toBe(false);
		expect(domainAllowed("a@firma.de.evil.com", domains)).toBe(false);
	});
	it("TXT-Eintrag auch in Stücken", () => {
		expect(txtMatches([["klick-portal=", "abc"]], "abc")).toBe(true);
		expect(txtMatches([[txtRecordValue("abc")]], "abd")).toBe(false);
	});
	it("Kurzname", () => {
		expect(portalSlugValid("beispiel-gmbh")).toBe(true);
		expect(portalSlugValid("code")).toBe(false);
		expect(portalSlugValid("A")).toBe(false);
	});
});

describe("Einmal-Code", () => {
	const now = new Date("2026-10-26T10:00:00Z");
	const hash = codeHash("geheim", "r1", "123456");
	const row = {
		codeHash: hash,
		codeExpiresAt: new Date("2026-10-26T10:05:00Z"),
		codeAttempts: 0,
	};
	it("richtig, falsch, abgelaufen, gesperrt, keiner", () => {
		expect(checkCode(row, hash, now)).toBe("ok");
		expect(checkCode(row, codeHash("geheim", "r1", "123457"), now)).toBe(
			"wrong",
		);
		// derselbe Code für eine andere Person passt nicht
		expect(checkCode(row, codeHash("geheim", "r2", "123456"), now)).toBe(
			"wrong",
		);
		expect(checkCode(row, hash, new Date("2026-10-26T10:06:00Z"))).toBe(
			"expired",
		);
		expect(
			checkCode({ ...row, codeAttempts: CODE_MAX_ATTEMPTS }, hash, now),
		).toBe("locked");
		expect(
			checkCode(
				{ codeHash: null, codeExpiresAt: null, codeAttempts: 0 },
				hash,
				now,
			),
		).toBe("none");
	});
	it("Sitzungsdauer 1 bis 90 Tage", () => {
		expect(clampSessionDays(0)).toBe(1);
		expect(clampSessionDays(365)).toBe(90);
		expect(clampSessionDays(Number.NaN)).toBe(30);
	});
});
