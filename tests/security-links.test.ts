import { describe, expect, it } from "vitest";
import { buildDigest, buildImmediateMail } from "@/lib/jobs/digest";
import { transactionalEmail } from "@/lib/mail/templates";
import { safeInternalPath } from "@/lib/safe-path";
import { httpUrl } from "@/lib/validation/common";
import { isPublicHttpsUrl } from "@/lib/validation/sso";

describe("safeInternalPath", () => {
	it.each([
		["/heute", "/heute"],
		["/einladung/abc?x=1", "/einladung/abc?x=1"],
		["/controls/CC-01#nachweise", "/controls/CC-01#nachweise"],
	])("lässt interne Pfade durch: %s", (input, out) => {
		expect(safeInternalPath(input)).toBe(out);
	});

	it.each([
		"//evil.tld",
		"/\\evil.tld",
		"/\tevil.tld",
		"https://evil.tld",
		"javascript:alert(1)",
		"heute",
		"",
		"/a\\b",
		"/\n/evil.tld",
	])("blockt %j", (input) => {
		expect(safeInternalPath(input)).toBe("/heute");
	});

	it("nutzt den übergebenen Fallback", () => {
		expect(safeInternalPath("//x", "")).toBe("");
		expect(safeInternalPath(undefined, "/login")).toBe("/login");
	});
});

describe("Mail-Templates escapen Nutzereingaben", () => {
	it("Titel, Text und Fußnote erscheinen als Text, nicht als HTML", () => {
		const mail = transactionalEmail({
			subject: "<b>x</b>",
			title: '<a href="https://evil.tld">Klick</a>',
			body: "Gerät: <img src=x onerror=alert(1)>\nZeile 2",
			footnote: "<script>",
		});
		expect(mail.html).not.toContain("<img");
		expect(mail.html).not.toContain('<a href="https://evil.tld">');
		expect(mail.html).not.toContain("<script>");
		expect(mail.html).toContain(
			"&lt;img src=x onerror=alert(1)&gt;<br>Zeile 2",
		);
		expect(mail.html).toContain("<title>&lt;b&gt;x&lt;/b&gt;</title>");
	});

	it("CTA nur mit http(s)-Ziel", () => {
		const bad = transactionalEmail({
			subject: "s",
			title: "t",
			body: "b",
			cta: { label: "Öffnen", url: "javascript:alert(1)" },
		});
		expect(bad.html).not.toContain("javascript:");
		const good = transactionalEmail({
			subject: "s",
			title: "t",
			body: "b",
			cta: { label: "Öffnen", url: 'https://klick.test/heute?a=1&b="2"' },
		});
		expect(good.html).toContain(
			'href="https://klick.test/heute?a=1&amp;b=&quot;2&quot;"',
		);
	});

	it("kein Recruiting-Slogan mehr", () => {
		const mail = transactionalEmail({ subject: "s", title: "t", body: "b" });
		expect(mail.html).not.toContain("Bewerben");
		expect(mail.text).not.toContain("Bewerben");
	});

	it("Sofort-Mail: Titel aus Nutzereingabe escaped, fremde Links fallen weg", () => {
		const mail = buildImmediateMail(
			{
				kind: "mentioned",
				title: "<b>Hallo</b>",
				body: null,
				link: "//evil.tld/x",
				createdAt: new Date(),
			},
			{ baseUrl: "https://klick.test" },
		);
		expect(mail.html).not.toContain("<b>Hallo</b>");
		expect(mail.html).not.toContain("evil.tld");
		expect(mail.html).toContain('href="https://klick.test/heute"');
	});

	it("Digest: interne Links absolut, externe weg", () => {
		const d = buildDigest(
			[
				{
					kind: "mentioned",
					title: "A",
					body: null,
					link: "/controls/CC-01",
					createdAt: new Date(),
				},
				{
					kind: "mentioned",
					title: "B",
					body: null,
					link: "https://evil.tld/",
					createdAt: new Date(),
				},
			],
			{
				baseUrl: "https://klick.test/",
				recipientName: "Ana",
				date: new Date("2026-10-17T05:00:00Z"),
			},
		);
		expect(d?.html).toContain('href="https://klick.test/controls/CC-01"');
		expect(d?.html).not.toContain("evil.tld");
	});
});

describe("URL-Schemata", () => {
	it("httpUrl nimmt nur http(s)", () => {
		expect(httpUrl.safeParse("https://x.de/a").success).toBe(true);
		expect(httpUrl.safeParse("javascript:alert(1)").success).toBe(false);
		expect(httpUrl.safeParse("data:text/html,hi").success).toBe(false);
	});

	it.each([
		["https://login.microsoftonline.com/tenant/v2.0", true],
		["https://idp.firma.de", true],
		["http://idp.firma.de", false],
		["https://localhost:8080", false],
		["https://127.0.0.1", false],
		["https://169.254.169.254/latest", false],
		["https://10.0.0.5", false],
		["https://192.168.1.10", false],
		["https://[::1]/", false],
		["https://intranet/", false],
		["https://keycloak.internal", false],
	])("SSO-Issuer %s → %s", (url, ok) => {
		expect(isPublicHttpsUrl(url)).toBe(ok);
	});
});
