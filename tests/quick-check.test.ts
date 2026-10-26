import { describe, expect, it } from "vitest";
import {
	analyzeBundles,
	analyzeCookies,
	analyzeDns,
	analyzeHeaders,
	analyzeSecurityTxt,
	analyzeSourceMaps,
	analyzeTls,
	scriptUrls,
	sourceMapUrl,
} from "@/lib/security/quick-check/analyze";
import { safeFetch } from "@/lib/security/quick-check/fetcher";
import { baseDomain } from "@/lib/security/quick-check/run";
import {
	embeddedV4,
	isBlockedAddress,
	resolvePublic,
	validateTargetUrl,
} from "@/lib/security/quick-check/ssrf";

// Secret-förmige Testdaten zur Laufzeit (gitleaks).
const jwt = (claims: object) =>
	[
		Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
			"base64url",
		),
		Buffer.from(JSON.stringify(claims)).toString("base64url"),
		"x".repeat(43),
	].join(".");

describe("SSRF-Schutz", () => {
	it("blockiert private, Loopback-, Link-Local- und Metadaten-Adressen", () => {
		for (const ip of [
			"127.0.0.1",
			"10.1.2.3",
			"172.16.0.1",
			"192.168.1.1",
			"169.254.169.254",
			"100.64.0.1",
			"0.0.0.0",
			"224.0.0.1",
			"::1",
			"fe80::1",
			"fd12:3456::1",
			"fd00:ec2::254",
			// Teredo und lokales NAT64 (Selbstprüfung)
			"2001:0:4136:e378:8000:63bf:3fff:fdd2",
			"64:ff9b:1::a00:1",
		])
			expect(isBlockedAddress(ip), ip).toBe(true);
		for (const ip of ["93.184.216.34", "1.1.1.1", "2606:4700:4700::1111"])
			expect(isBlockedAddress(ip), ip).toBe(false);
	});

	it("erkennt IPv4 in IPv6 (mapped, NAT64, 6to4)", () => {
		expect(embeddedV4("::ffff:127.0.0.1")).toBe("127.0.0.1");
		expect(embeddedV4("::ffff:7f00:1")).toBe("127.0.0.1");
		expect(embeddedV4("64:ff9b::a9fe:a9fe")).toBe("169.254.169.254");
		expect(embeddedV4("2002:c0a8:0101::1")).toBe("192.168.1.1");
		expect(isBlockedAddress("::ffff:10.0.0.1")).toBe(true);
		expect(isBlockedAddress("64:ff9b::7f00:1")).toBe(true);
		expect(isBlockedAddress("2002:7f00:0001::")).toBe(true);
		expect(isBlockedAddress("::ffff:93.184.216.34")).toBe(false);
	});

	it("URL-Form: nur http(s), 80/443, keine Zugangsdaten, keine internen Namen", () => {
		expect(validateTargetUrl("https://example.com/").ok).toBe(true);
		const err = (u: string) => {
			const r = validateTargetUrl(u);
			return r.ok ? null : r.error;
		};
		expect(err("ftp://example.com")).toBe("protocol");
		expect(err("file:///etc/passwd")).toBe("protocol");
		expect(err("https://user:pw@example.com")).toBe("credentials");
		expect(err("https://example.com:8443")).toBe("port");
		expect(err("http://localhost")).toBe("host");
		expect(err("http://db.internal")).toBe("host");
		expect(err("http://intranet")).toBe("host");
		expect(err("http://127.0.0.1")).toBe("blocked_address");
		expect(err("http://[::1]/")).toBe("blocked_address");
		expect(err("not a url")).toBe("invalid_url");
	});

	it("DNS: alle Adressen müssen öffentlich sein (Rebinding-Mischung)", async () => {
		const mixed = async () => [
			{ address: "93.184.216.34", family: 4 },
			{ address: "10.0.0.5", family: 4 },
		];
		expect(await resolvePublic("evil.example", mixed)).toEqual({
			ok: false,
			error: "blocked_address",
		});
		expect(
			await resolvePublic("ok.example", async () => [
				{ address: "2606:4700::1", family: 6 },
				{ address: "93.184.216.34", family: 4 },
			]),
		).toEqual({ ok: true, address: "93.184.216.34", family: 4 });
		expect(
			await resolvePublic("x.example", async () => {
				throw new Error("ENOTFOUND");
			}),
		).toEqual({ ok: false, error: "dns" });
	});

	it("safeFetch verweigert Ziele, die auf interne Adressen zeigen, ohne Anfrage", async () => {
		const budget = { requests: 5, deadline: Date.now() + 5000 };
		const r = await safeFetch("https://metadata.example.com/", {
			budget,
			resolve: async () => [{ address: "169.254.169.254", family: 4 }],
		});
		expect(r).toEqual({ ok: false, error: "blocked_address" });
		expect(budget.requests).toBe(5);
	});
});

describe("Schnellcheck-Analysen", () => {
	const url = "https://app.example.com/";

	it("Header: fehlende Schutz-Header, Versionen, unsafe-inline", () => {
		const ids = analyzeHeaders(url, {
			server: "nginx/1.18.0",
			"content-security-policy": "script-src 'self' 'unsafe-inline'",
		}).map((f) => f.ruleId);
		expect(ids).toEqual([
			"qc-hsts-missing",
			"qc-csp-unsafe-inline",
			"qc-nosniff",
			"qc-clickjacking",
			"qc-referrer-policy",
			"qc-version-disclosure",
		]);
		const good = analyzeHeaders(url, {
			"strict-transport-security": "max-age=31536000; includeSubDomains",
			"content-security-policy":
				"script-src 'nonce-abc' 'strict-dynamic'; frame-ancestors 'none'",
			"x-content-type-options": "nosniff",
			"referrer-policy": "strict-origin-when-cross-origin",
		});
		expect(good).toEqual([]);
		expect(analyzeHeaders("http://app.example.com/", {})[0]?.ruleId).toBe(
			"qc-no-https",
		);
	});

	it("Cookies: Secure, HttpOnly für Sitzungen, SameSite", () => {
		const f = analyzeCookies(url, [
			"session=abc; Path=/",
			"theme=dark; Secure; SameSite=Lax",
		]);
		expect(f.map((x) => x.ruleId)).toEqual([
			"qc-cookie-secure",
			"qc-cookie-httponly",
			"qc-cookie-samesite",
		]);
		expect(f[0]?.description).toContain("session");
		expect(f[0]?.description).not.toContain("abc");
	});

	it("TLS: ungültig, läuft ab, alte Protokolle", () => {
		const now = new Date("2026-10-17T00:00:00Z");
		const f = analyzeTls(
			url,
			{
				protocol: "TLSv1.1",
				validTo: "Oct 25 00:00:00 2026 GMT",
				issuer: "X",
				authorized: false,
				authError: "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
			},
			now,
		);
		expect(f.map((x) => [x.ruleId, x.severity])).toEqual([
			["qc-tls-invalid", "high"],
			["qc-tls-expiry", "medium"],
			["qc-tls-old", "high"],
		]);
		expect(analyzeTls(url, null, now)).toEqual([]);
	});

	it("DNS: SPF, DMARC, CAA; unbekannt (null) meldet nichts", () => {
		expect(
			analyzeDns("example.com", { txt: [], dmarc: [], caa: false }).map(
				(f) => f.ruleId,
			),
		).toEqual(["qc-spf-missing", "qc-dmarc-missing", "qc-caa-missing"]);
		expect(
			analyzeDns("example.com", {
				txt: ["v=spf1 include:_spf.example.net -all"],
				dmarc: ["v=DMARC1; p=none"],
				caa: true,
			}).map((f) => f.ruleId),
		).toEqual(["qc-dmarc-none"]);
		expect(
			analyzeDns("example.com", { txt: null, dmarc: null, caa: null }),
		).toEqual([]);
	});

	it("security.txt: fehlt, abgelaufen, gültig", () => {
		const now = new Date("2026-10-17");
		const u = `${url}.well-known/security.txt`;
		expect(analyzeSecurityTxt(u, null, now)[0]?.ruleId).toBe("qc-security-txt");
		expect(
			analyzeSecurityTxt(
				u,
				{
					status: 200,
					body: "Contact: mailto:a@b.c\nExpires: 2025-01-01T00:00:00Z",
				},
				now,
			)[0]?.ruleId,
		).toBe("qc-security-txt-expired");
		expect(
			analyzeSecurityTxt(
				u,
				{
					status: 200,
					body: "Contact: mailto:a@b.c\nExpires: 2027-06-01T00:00:00Z",
				},
				now,
			),
		).toEqual([]);
	});

	it("Bundles: service_role-Key ist kritisch, anon-Key kein Fund, kein Wert gespeichert", () => {
		const secret = jwt({ iss: "supabase", role: "service_role" });
		const anon = jwt({ iss: "supabase", role: "anon" });
		const f = analyzeBundles([
			{
				url: `${url}_next/static/chunks/app.js`,
				text: `const k="${secret}";const a="${anon}";`,
			},
		]);
		expect(f).toHaveLength(1);
		expect(f[0]).toMatchObject({
			ruleId: "qc-bundle-supabase_service_role",
			severity: "critical",
			category: "secret",
		});
		expect(JSON.stringify(f)).not.toContain(secret);
	});

	it("Skripte derselben Herkunft, Source-Map-Erkennung", () => {
		const html = `<script src="/_next/a.js"></script><script src="https://cdn.other.com/x.js"></script><link rel="modulepreload" href="/m.js">`;
		expect(scriptUrls(html, url)).toEqual([
			"https://app.example.com/_next/a.js",
			"https://app.example.com/m.js",
		]);
		expect(
			sourceMapUrl("x();\n//# sourceMappingURL=a.js.map", `${url}_next/a.js`),
		).toBe("https://app.example.com/_next/a.js.map");
		expect(
			sourceMapUrl(
				"x();//# sourceMappingURL=data:application/json;base64,e30=",
				url,
			),
		).toBeNull();
		expect(
			analyzeSourceMaps([{ url: `${url}a.js.map`, exposed: true }])[0]?.ruleId,
		).toBe("qc-sourcemap");
		expect(analyzeSourceMaps([{ url: "x", exposed: false }])).toEqual([]);
	});

	it("registrierbare Domain", () => {
		expect(baseDomain("app.staging.example.com")).toBe("example.com");
		expect(baseDomain("shop.example.co.uk")).toBe("example.co.uk");
	});
});

describe("runQuickCheck (Ablauf mit simulierten Antworten)", () => {
	it("Seite → Bundles → Source-Map → security.txt → DNS, ein Scan mit allen Befunden", async () => {
		const { runQuickCheck } = await import("@/lib/security/quick-check/run");
		const secret = jwt({ iss: "supabase", role: "service_role" });
		const pages: Record<
			string,
			{
				status: number;
				body: string;
				headers?: Record<string, string | string[]>;
			}
		> = {
			"https://app.example.com/": {
				status: 200,
				headers: { "set-cookie": ["sb-access-token=x; Path=/"] },
				body: '<html><script src="/_next/static/app.js"></script><script src="https://cdn.example.net/x.js"></script></html>',
			},
			"https://app.example.com/_next/static/app.js": {
				status: 200,
				body: `const k="${secret}";\n//# sourceMappingURL=app.js.map`,
			},
			"https://app.example.com/_next/static/app.js.map": {
				status: 200,
				body: '{"version":3}',
			},
			"https://app.example.com/.well-known/security.txt": {
				status: 404,
				body: "",
			},
		};
		const requested: string[] = [];
		const fake = (async (
			url: string,
			opts: { budget: { requests: number } },
		) => {
			requested.push(url);
			opts.budget.requests -= 1;
			const p = pages[url];
			if (!p) return { ok: false as const, error: "network" as const };
			return {
				ok: true as const,
				res: {
					url,
					status: p.status,
					headers: p.headers ?? {},
					body: p.body,
					truncated: false,
					tls: {
						protocol: "TLSv1.3",
						validTo: "Dec 31 00:00:00 2027 GMT",
						issuer: "R11",
						authorized: true,
						authError: null,
					},
					redirects: [],
				},
			};
		}) as unknown as typeof safeFetch;
		const r = await runQuickCheck("https://app.example.com/", {
			fetch: fake,
			txt: async (n) => (n.startsWith("_dmarc.") ? [] : ["v=spf1 -all"]),
			caa: async () => true,
			now: new Date("2026-10-17"),
		});
		if (!r.ok) throw new Error(r.error);
		// fremde Herkunft (CDN) wird nicht geladen, keine Pfad-Proben
		expect(requested).toEqual([
			"https://app.example.com/",
			"https://app.example.com/_next/static/app.js",
			"https://app.example.com/_next/static/app.js.map",
			"https://app.example.com/.well-known/security.txt",
		]);
		expect(r.requests).toBe(4);
		const ids = r.scan.findings.map((f) => f.ruleId);
		expect(ids).toEqual(
			expect.arrayContaining([
				"qc-hsts-missing",
				"qc-csp-missing",
				"qc-cookie-secure",
				"qc-cookie-httponly",
				"qc-bundle-supabase_service_role",
				"qc-sourcemap",
				"qc-security-txt",
				"qc-dmarc-missing",
			]),
		);
		expect(ids).not.toContain("qc-spf-missing");
		expect(r.scan.target).toBe("https://app.example.com");
		expect(JSON.stringify(r.scan)).not.toContain(secret);
	});
});
