import { afterEach, describe, expect, it, vi } from "vitest";
import { mailErrorHint, sendTransactionalMail } from "@/lib/mail/send";

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

describe("mailErrorHint", () => {
	const ok = { mailFromIsFallback: false };

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

	it("fehlendes MAIL_FROM geht vor, Unbekanntes bleibt ohne Hinweis", () => {
		expect(
			mailErrorHint("smtp_failed:550 sender rejected", {
				mailFromIsFallback: true,
			}),
		).toMatch(/MAIL_FROM fehlt/);
		expect(mailErrorHint("smtp_failed:etwas Neues", ok)).toBeNull();
	});
});
