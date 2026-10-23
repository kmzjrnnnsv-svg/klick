import { afterEach, describe, expect, it, vi } from "vitest";
import {
	diagnoseMailConfig,
	mailErrorHint,
	parseFrom,
	sendTransactionalMail,
} from "@/lib/mail/send";

const mail = {
	to: "a@example.org",
	subject: "Dein Login-Link",
	text: "https://raza.work/api/auth/magic-link/verify?token=GEHEIM",
};

function captured(spy: ReturnType<typeof vi.spyOn>): string {
	return spy.mock.calls.map((c: unknown[]) => c.join(" ")).join("\n");
}

describe("sendTransactionalMail ohne Zustellweg", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it("Dev: Inhalt landet in der Konsole und zählt als zugestellt", async () => {
		vi.stubEnv("NODE_ENV", "development");
		vi.stubEnv("RESEND_API_KEY", "");
		vi.stubEnv("SMTP_HOST", "");
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const out = await sendTransactionalMail(mail);
		expect(out.ok).toBe(true);
		expect(captured(log)).toContain("token=GEHEIM");
	});

	it("Prod: Magic-Link nie im Log, Versand gilt als fehlgeschlagen", async () => {
		vi.stubEnv("NODE_ENV", "production");
		vi.stubEnv("RESEND_API_KEY", "");
		vi.stubEnv("SMTP_HOST", "");
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const err = vi.spyOn(console, "error").mockImplementation(() => {});
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const out = await sendTransactionalMail(mail);
		expect(out.ok).toBe(false);
		const all = [captured(log), captured(err), captured(warn)].join("\n");
		expect(all).not.toContain("GEHEIM");
		expect(all).toContain("a@example.org");
	});
});

describe("Brevo über HTTPS", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	function prodWith(keys: {
		resend?: string;
		brevo?: string;
		allowResend?: boolean;
	}) {
		vi.stubEnv("NODE_ENV", "production");
		vi.stubEnv("MAIL_FROM", "Klick <no-reply@raza.work>");
		vi.stubEnv("RESEND_API_KEY", keys.resend ?? "");
		vi.stubEnv("MAIL_ALLOW_RESEND", keys.allowResend ? "true" : "");
		vi.stubEnv("BREVO_API_KEY", keys.brevo ?? "");
		vi.stubEnv("SMTP_HOST", "");
		vi.spyOn(console, "log").mockImplementation(() => {});
		vi.spyOn(console, "warn").mockImplementation(() => {});
	}

	it("schickt HTML und Text mit getrenntem Absender an die Brevo-API", async () => {
		prodWith({ brevo: "xkeysib-test" });
		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(new Response("{}", { status: 201 }));
		const out = await sendTransactionalMail({ ...mail, html: "<p>Hallo</p>" });
		expect(out).toEqual({ path: "brevo", ok: true });
		const [url, init] = fetchSpy.mock.calls[0] ?? [];
		expect(url).toBe("https://api.brevo.com/v3/smtp/email");
		expect((init?.headers as Record<string, string>)["api-key"]).toBe(
			"xkeysib-test",
		);
		expect(JSON.parse(String(init?.body))).toEqual({
			sender: { name: "Klick", email: "no-reply@raza.work" },
			to: [{ email: "a@example.org" }],
			subject: mail.subject,
			textContent: mail.text,
			htmlContent: "<p>Hallo</p>",
		});
	});

	it("Brevo zuerst; Resend (USA) bleibt ohne Schalter aus", async () => {
		prodWith({ resend: "re_test", brevo: "xkeysib-test" });
		const err = vi.spyOn(console, "error").mockImplementation(() => {});
		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(new Response("down", { status: 500 }));
		const out = await sendTransactionalMail(mail);
		expect(out.ok).toBe(false);
		expect(fetchSpy.mock.calls.map((c) => String(c[0]))).toEqual([
			"https://api.brevo.com/v3/smtp/email",
		]);
		expect(captured(err)).not.toContain("GEHEIM");
		const cfg = await diagnoseMailConfig();
		expect(cfg).toMatchObject({ likelyPath: "brevo", resendAllowed: false });
	});

	it("fällt mit MAIL_ALLOW_RESEND von Brevo auf Resend zurück", async () => {
		prodWith({ resend: "re_test", brevo: "xkeysib-test", allowResend: true });
		vi.spyOn(console, "error").mockImplementation(() => {});
		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValueOnce(new Response("down", { status: 500 }))
			.mockResolvedValueOnce(new Response("{}", { status: 200 }));
		const out = await sendTransactionalMail(mail);
		expect(out).toEqual({ path: "resend", ok: true });
		expect(fetchSpy.mock.calls.map((c) => String(c[0]))).toEqual([
			"https://api.brevo.com/v3/smtp/email",
			"https://api.resend.com/emails",
		]);
	});

	it("nur Resend ohne Schalter: kein Zustellweg", async () => {
		prodWith({ resend: "re_test" });
		vi.spyOn(console, "error").mockImplementation(() => {});
		const fetchSpy = vi.spyOn(globalThis, "fetch");
		const out = await sendTransactionalMail(mail);
		expect(out).toMatchObject({ path: "console", ok: false });
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("Fehler: zählt als nicht zugestellt, Inhalt nie im Log", async () => {
		prodWith({ brevo: "xkeysib-test" });
		const err = vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response('{"code":"unauthorized","message":"Key not found"}', {
				status: 401,
			}),
		);
		const out = await sendTransactionalMail(mail);
		expect(out.ok).toBe(false);
		expect(out.ok === false && out.error).toMatch(/^brevo_failed:brevo_401/);
		expect(captured(err)).not.toContain("GEHEIM");
	});

	it("zerlegt MAIL_FROM", () => {
		expect(parseFrom("Klick <no-reply@raza.work>")).toEqual({
			name: "Klick",
			email: "no-reply@raza.work",
		});
		expect(parseFrom('"Maison Klick" <a@b.de>')).toEqual({
			name: "Maison Klick",
			email: "a@b.de",
		});
		expect(parseFrom("<a@b.de>")).toEqual({ email: "a@b.de" });
		expect(parseFrom("a@b.de")).toEqual({ email: "a@b.de" });
	});
});

describe("mailErrorHint", () => {
	const ok = {};

	it("benennt die üblichen Ursachen", () => {
		expect(mailErrorHint("no_provider", ok)).toMatch(/Kein Zustellweg/);
		expect(
			mailErrorHint(
				"smtp_failed:Invalid login: 535 5.7.8 Authentication failed",
				ok,
			),
		).toMatch(/SMTP-Anmeldung abgelehnt/);
		expect(
			mailErrorHint("smtp_failed:connect ETIMEDOUT 1.2.3.4:465", {
				...ok,
				smtpPort: 465,
			}),
		).toMatch(/Port 465 .* gesperrt/);
		expect(
			mailErrorHint(
				'resend_failed:resend_403:{"message":"The raza.work domain is not verified"}',
				ok,
			),
		).toMatch(/nicht verifiziert/);
		expect(
			mailErrorHint("smtp_failed:getaddrinfo ENOTFOUND smtp.x", ok),
		).toMatch(/nicht auflösbar/);
	});

	it("benennt Brevo-Ursachen", () => {
		expect(
			mailErrorHint(
				'brevo_failed:brevo_401:{"code":"unauthorized","message":"We have detected you are using an unrecognised IP address 1.2.3.4"}',
				ok,
			),
		).toMatch(/IP des Servers/);
		expect(
			mailErrorHint(
				'brevo_failed:brevo_401:{"code":"unauthorized","message":"Key not found"}',
				ok,
			),
		).toMatch(/BREVO_API_KEY/);
		expect(
			mailErrorHint(
				'brevo_failed:brevo_400:{"code":"invalid_parameter","message":"Sender is invalid / inactive"}',
				ok,
			),
		).toMatch(/Absender nicht freigegeben/);
		expect(
			mailErrorHint(
				"brevo_failed:The operation was aborted due to timeout",
				ok,
			),
		).toMatch(/Port 443/);
	});

	it("abgelehnter Absender nennt die Plattform-Adresse, Unbekanntes bleibt ohne Hinweis", () => {
		expect(mailErrorHint("smtp_failed:550 sender rejected", ok)).toMatch(
			/no-reply@raza\.work/,
		);
		expect(mailErrorHint("smtp_failed:etwas Neues", ok)).toBeNull();
	});
});

describe("Absender", () => {
	afterEach(() => vi.unstubAllEnvs());

	it("ohne MAIL_FROM gilt no-reply@raza.work", async () => {
		vi.stubEnv("MAIL_FROM", "");
		expect((await diagnoseMailConfig()).mailFrom).toBe(
			"Klick <no-reply@raza.work>",
		);
		vi.stubEnv("MAIL_FROM", "Klick <no-reply@raza.work>");
		expect((await diagnoseMailConfig()).mailFrom).toBe(
			"Klick <no-reply@raza.work>",
		);
	});
});

describe("Pflichtangaben in Mails", () => {
	const env = {
		BETTER_AUTH_URL: "https://raza.work/",
		LEGAL_NAME: "Raza",
		LEGAL_FORM: "GmbH",
		LEGAL_ADDRESS: "Musterstraße 1;60311 Frankfurt am Main",
		LEGAL_REPRESENTATIVES: "Erika Muster",
		LEGAL_REGISTER: "Amtsgericht Frankfurt am Main, HRB 1",
	};

	it("hängt Firma, Vertretung, Register und Impressum an Text und HTML", async () => {
		const { withLegalFooter } = await import("@/lib/mail/send");
		const out = withLegalFooter(
			{ ...mail, html: "<html><body><p>Hallo</p></body></html>" },
			env,
		);
		expect(out.text).toContain(
			"Raza GmbH, Musterstraße 1, 60311 Frankfurt am Main",
		);
		expect(out.text).toContain("Vertreten durch Erika Muster");
		expect(out.text).toContain("Impressum: https://raza.work/impressum");
		expect(out.html).toMatch(/Amtsgericht Frankfurt am Main, HRB 1<br>/);
		expect(out.html?.indexOf("HRB 1")).toBeLessThan(
			out.html?.indexOf("</body>") ?? 0,
		);
	});

	it("escaped die Angaben im HTML und lässt ohne Angaben alles unverändert", async () => {
		const { withLegalFooter } = await import("@/lib/mail/send");
		const out = withLegalFooter(
			{ ...mail, html: "<p>x</p>" },
			{ ...env, LEGAL_NAME: "<b>Raza</b>" },
		);
		expect(out.html).toContain("&lt;b&gt;Raza&lt;/b&gt;");
		expect(withLegalFooter(mail, {})).toEqual(mail);
	});
});
