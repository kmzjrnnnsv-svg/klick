import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	deviceLabel,
	isUserEventAction,
	parseUserFilter,
	USER_EVENT_ACTIONS,
	userFilterHref,
	userMatches,
} from "@/lib/admin/users";
import de from "@/messages/de.json";

const row = {
	name: "Mara Beispiel",
	email: "mara@beispiel.de",
	role: null,
	status: "active" as const,
	factors: 1,
	orgNames: ["Beispiel GmbH"],
};

describe("admin users: Filter", () => {
	it("liest Suche und Status aus der URL, Unbekanntes wird „alle“", () => {
		expect(parseUserFilter({ q: "  Mara ", status: "blocked" })).toEqual({
			q: "mara",
			status: "blocked",
		});
		expect(parseUserFilter({ status: "x" }).status).toBe("all");
		expect(parseUserFilter({}).q).toBe("");
		expect(parseUserFilter({ q: "a".repeat(500) }).q.length).toBe(120);
	});

	it("sucht in Name, E-Mail und Unternehmen", () => {
		const f = (q: string) => userMatches(row, { q, status: "all" });
		expect(f("mara")).toBe(true);
		expect(f("beispiel.de")).toBe(true);
		expect(f("gmbh")).toBe(true);
		expect(f("anderes")).toBe(false);
	});

	it("ohne Faktor zählt nur aktive Konten, nicht aktivierte nie", () => {
		const s = { q: "", status: "no_factor" as const };
		expect(userMatches({ ...row, factors: 0 }, s)).toBe(true);
		expect(userMatches({ ...row, factors: 1 }, s)).toBe(false);
		expect(userMatches({ ...row, factors: 0, status: "pending" }, s)).toBe(
			false,
		);
	});

	it("Klick-Admins und Status", () => {
		expect(
			userMatches({ ...row, role: "admin" }, { q: "", status: "admin" }),
		).toBe(true);
		expect(userMatches(row, { q: "", status: "admin" })).toBe(false);
		expect(
			userMatches({ ...row, status: "blocked" }, { q: "", status: "blocked" }),
		).toBe(true);
		expect(userMatches(row, { q: "", status: "pending" })).toBe(false);
	});

	it("baut Links mit Suche und Filter", () => {
		expect(userFilterHref({ q: "", status: "all" })).toBe("/admin/users");
		expect(userFilterHref({ q: "mara b", status: "blocked" })).toBe(
			"/admin/users?q=mara+b&status=blocked",
		);
	});
});

describe("admin users: Gerät aus dem Browser-Kopf", () => {
	it("erkennt übliche Browser und Systeme ohne Version", () => {
		expect(
			deviceLabel(
				"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
			),
		).toBe("Safari · macOS");
		expect(
			deviceLabel(
				"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0",
			),
		).toBe("Edge · Windows");
		expect(
			deviceLabel(
				"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1",
			),
		).toBe("Chrome · iPhone");
		expect(
			deviceLabel(
				"Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0",
			),
		).toBe("Firefox · Linux");
		expect(
			deviceLabel(
				"Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36",
			),
		).toBe("Chrome · Android");
	});

	it("leer, Skripte und Unbekanntes", () => {
		expect(deviceLabel(null)).toBeNull();
		expect(deviceLabel("")).toBeNull();
		expect(deviceLabel("curl/8.5.0")).toBe("Skript");
		expect(deviceLabel("node")).toBe("Skript");
		expect(deviceLabel("irgendwas")).toBeNull();
	});
});

describe("admin users: Ereignisse", () => {
	it("jede gezeigte Aktion hat einen Text", () => {
		const keys = Object.keys(de.AdminUsers);
		for (const a of USER_EVENT_ACTIONS)
			expect(keys, a).toContain(`ev_${a.replace(".", "_")}`);
		expect(isUserEventAction("auth.signin")).toBe(true);
		expect(isUserEventAction("risk.updated")).toBe(false);
	});

	it("die eigene Aktion schreibt genau den gelisteten Namen", () => {
		const src = readFileSync("lib/auth/admin-accounts.ts", "utf8");
		expect(src).toContain('action: "admin.sessions_revoked"');
	});
});
