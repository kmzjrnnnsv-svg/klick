import { describe, expect, it } from "vitest";
import { mailCheck, summarize } from "@/lib/health/readiness";

describe("Readiness", () => {
	it("ein Ausfall ergibt 503, Warnungen und Übersprungenes nicht", () => {
		expect(
			summarize({ database: "ok", storage: "skipped", mail: "warn" }),
		).toEqual({
			status: "ready",
			httpStatus: 200,
			checks: { database: "ok", storage: "skipped", mail: "warn" },
		});
		expect(summarize({ database: "ok", storage: "fail" }).httpStatus).toBe(503);
		expect(summarize({ database: "fail" }).status).toBe("not_ready");
	});

	it("Mail: in Produktion ohne Provider eine Warnung, sonst ok/skipped", () => {
		expect(mailCheck({ NODE_ENV: "production" })).toBe("warn");
		expect(mailCheck({ NODE_ENV: "production", SMTP_HOST: "smtp.x" })).toBe(
			"ok",
		);
		expect(mailCheck({ NODE_ENV: "production", RESEND_API_KEY: "re_1" })).toBe(
			"ok",
		);
		expect(mailCheck({ NODE_ENV: "development" })).toBe("skipped");
		expect(mailCheck({ NODE_ENV: "production", SMTP_HOST: " " })).toBe("warn");
	});
});
