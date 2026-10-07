import { afterEach, describe, expect, it, vi } from "vitest";
import { sendTransactionalMail } from "@/lib/mail/send";

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
