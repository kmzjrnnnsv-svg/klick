import { describe, expect, it } from "vitest";
import { githubActionsSnippet } from "@/lib/security/ci-snippets";
import {
	bearerToken,
	hashToken,
	hasScopes,
	newToken,
	tokenKindOf,
	tokenState,
} from "@/lib/security/tokens";

describe("Zugangstoken (ADR-017)", () => {
	it("Format klk_ingest_…, Präfix sichtbar, nur Hash gespeichert", () => {
		const t = newToken("ingest");
		expect(t.token).toMatch(/^klk_ingest_[A-Za-z0-9_-]{43}$/);
		expect(t.prefix).toBe(t.token.slice(0, 15));
		expect(t.hash).toBe(hashToken(t.token));
		expect(t.hash).toHaveLength(64);
		expect(t.hash).not.toContain(t.token.slice(11));
		expect(newToken("ingest").token).not.toBe(t.token);
		expect(newToken("supplier_portal").token.startsWith("klk_portal_")).toBe(
			true,
		);
	});

	it("Form prüfen, Bearer lesen, Zustand und Scopes", () => {
		const t = newToken("ingest").token;
		expect(tokenKindOf(t)).toBe("ingest");
		expect(tokenKindOf(`${t}x`)).toBeNull();
		expect(tokenKindOf("klk_ingest_kurz")).toBeNull();
		expect(bearerToken(`Bearer ${t}`)).toBe(t);
		expect(bearerToken(`bearer  ${t} `)).toBe(t);
		expect(bearerToken("Basic abc")).toBeNull();
		expect(bearerToken(null)).toBeNull();
		const now = new Date("2026-10-17");
		expect(
			tokenState({ expiresAt: new Date("2026-11-01"), revokedAt: null }, now),
		).toBe("ok");
		expect(
			tokenState({ expiresAt: new Date("2026-10-01"), revokedAt: null }, now),
		).toBe("expired");
		expect(
			tokenState(
				{
					expiresAt: new Date("2026-11-01"),
					revokedAt: new Date("2026-10-02"),
				},
				now,
			),
		).toBe("revoked");
		expect(hasScopes(["scan:write"], ["scan:write"])).toBe(true);
		expect(hasScopes(["scan:write"], ["sbom:write"])).toBe(false);
	});
});

describe("GitHub-Actions-Vorlage", () => {
	it("gepinnte Actions, Token als Secret, Gate und Produkt", () => {
		const y = githubActionsSnippet({
			baseUrl: "https://raza.work",
			productCode: "PRD-001",
			failOn: "critical",
			stagingUrl: "https://staging.example.com",
		});
		// jede Action per 40-stelligem Commit-SHA gepinnt
		const uses = [...y.matchAll(/uses: (\S+)/g)].map((m) => m[1] ?? "");
		expect(uses.length).toBe(5);
		for (const u of uses) expect(u).toMatch(/@[0-9a-f]{40}$/);
		// GitHub-Ausdruck, kein JS-Template
		expect(y).toContain(`KLICK_TOKEN: \${{ secrets.KLICK_TOKEN }}`);
		expect(y).toContain(
			"/api/ingest/scan?product=PRD-001&name=trivy.json&full=1&fail_on=critical",
		);
		expect(y).toContain("/api/ingest/sbom?product=PRD-001&name=sbom.cdx.json");
		expect(y).toContain("target: https://staging.example.com");
		expect(githubActionsSnippet({ baseUrl: "https://x" })).not.toContain(
			"zaproxy",
		);
	});
});
