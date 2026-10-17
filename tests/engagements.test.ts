import { describe, expect, it } from "vitest";
import { ENGAGEMENT_STATUS_MACHINE } from "@/lib/entities/engagement";
import { canTransition } from "@/lib/entities/status-machine";
import {
	buildEngagementReport,
	type ReportFinding,
} from "@/lib/export/engagement-report";
import { parseCvss, roundUp1, severityFromScore } from "@/lib/security/cvss";
import {
	type EngagementLike,
	engagementControls,
	engagementGate,
	engagementResult,
	retestDueDate,
} from "@/lib/security/engagement-rules";

describe("CVSS", () => {
	it.each([
		["CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H", 9.8],
		["CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H", 10],
		["CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N", 6.1],
		["CVSS:3.1/AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H", 7.8],
		["CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:N/A:N", 5.9],
		["CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N", 6.5],
		["CVSS:3.1/AV:P/AC:H/PR:H/UI:R/S:U/C:N/I:N/A:N", 0],
		["CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/E:P/RL:O", 9.8],
	])("%s → %s", (vector, score) => {
		const r = parseCvss(vector);
		expect(r.ok && r.version === "3.1" ? r.score : null).toBe(score);
	});

	it("Roundup nach Anhang A", () => {
		expect(roundUp1(4.02)).toBe(4.1);
		expect(roundUp1(4.0)).toBe(4);
		expect(roundUp1(4.000_001)).toBe(4);
	});

	it("CVSS 4.0: Form geprüft, Wert kommt aus dem Bericht", () => {
		const r = parseCvss(
			"CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N",
		);
		expect(r).toMatchObject({ ok: true, version: "4.0", score: null });
	});

	it("Fehler: Format, unbekannte Metrik, fehlende Metrik, doppelt", () => {
		expect(parseCvss("AV:N/AC:L")).toEqual({
			ok: false,
			error: "cvss_format",
		});
		expect(
			parseCvss("CVSS:3.1/AV:X/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H"),
		).toMatchObject({ error: "cvss_metric" });
		expect(parseCvss("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H")).toMatchObject(
			{ error: "cvss_missing" },
		);
		expect(
			parseCvss("CVSS:3.1/AV:N/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H"),
		).toMatchObject({ error: "cvss_format" });
		expect(
			parseCvss("CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H"),
		).toMatchObject({ error: "cvss_missing" });
	});

	it("Schwere nach qualitativer Skala", () => {
		expect(severityFromScore(9)).toBe("critical");
		expect(severityFromScore(8.9)).toBe("high");
		expect(severityFromScore(4)).toBe("medium");
		expect(severityFromScore(3.9)).toBe("low");
		expect(severityFromScore(0)).toBe("info");
	});
});

const base: EngagementLike = {
	kind: "pentest",
	targets: ["https://staging.example.com"],
	startAt: "2026-11-02",
	endAt: "2026-11-06",
	authorizationEvidenceId: "ev-1",
	summary: null,
};

describe("engagementGate", () => {
	it("beauftragt nur mit Beauftragung, Zielen und Zeitraum", () => {
		expect(engagementGate("authorized", base, [])).toBeNull();
		expect(
			engagementGate(
				"authorized",
				{ ...base, authorizationEvidenceId: null },
				[],
			),
		).toBe("authorization_missing");
		expect(engagementGate("authorized", { ...base, targets: [] }, [])).toBe(
			"targets_missing",
		);
		expect(
			engagementGate("authorized", { ...base, endAt: "2026-11-01" }, []),
		).toBe("period_missing");
		// Schnellcheck ist passiv: keine schriftliche Beauftragung nötig
		expect(
			engagementGate(
				"authorized",
				{ ...base, kind: "quick_check", authorizationEvidenceId: null },
				[],
			),
		).toBeNull();
	});

	it("geliefert nur mit Summary; abschließen nur ohne offene, nicht nachgetestete Befunde", () => {
		expect(engagementGate("delivered", base, [])).toBe("summary_missing");
		expect(
			engagementGate("delivered", { ...base, summary: "Gesamtbild gut." }, []),
		).toBeNull();
		const open = {
			severity: "high" as const,
			status: "open" as const,
			retestStatus: "pending" as const,
		};
		expect(engagementGate("closed", base, [open])).toBe("retest_open");
		expect(
			engagementGate("closed", base, [{ ...open, retestStatus: "failed" }]),
		).toBeNull();
		expect(
			engagementGate("closed", base, [{ ...open, status: "resolved" }]),
		).toBeNull();
	});

	it("Statusmaschine: kein Sprung von geplant zu geliefert, Abbruch nur mit Notiz", () => {
		expect(
			canTransition(ENGAGEMENT_STATUS_MACHINE, "planned", "delivered").ok,
		).toBe(false);
		expect(
			canTransition(ENGAGEMENT_STATUS_MACHINE, "planned", "cancelled"),
		).toEqual({ ok: false, reason: "note" });
		expect(
			canTransition(ENGAGEMENT_STATUS_MACHINE, "reporting", "delivered").ok,
		).toBe(true);
	});
});

describe("Lieferung", () => {
	const f = (
		severity: "critical" | "high" | "medium" | "low",
		status: "open" | "resolved" = "open",
	) => ({ severity, status, retestStatus: null });

	it("Ergebnis: offen kritisch → fail, hoch/mittel → teilweise, sonst wirksam", () => {
		expect(engagementResult([f("critical"), f("low")])).toBe("fail");
		expect(engagementResult([f("critical", "resolved"), f("high")])).toBe(
			"partial",
		);
		expect(engagementResult([f("medium")])).toBe("partial");
		expect(engagementResult([f("low"), f("critical", "resolved")])).toBe(
			"pass",
		);
		expect(engagementResult([])).toBe("pass");
	});

	it("Nachtest-Frist: 30 Tage bei kritisch/hoch, 90 sonst, keine ohne offene", () => {
		const from = new Date("2026-11-10T10:00:00Z");
		expect(retestDueDate([f("high")], from)).toBe("2026-12-10");
		expect(retestDueDate([f("medium")], from)).toBe("2027-02-08");
		expect(retestDueDate([f("critical", "resolved")], from)).toBeNull();
	});

	it("geprüfte Controls: Pentest am Herstellerprodukt zusätzlich CC-PRD-10", () => {
		expect(engagementControls("pentest", "manufacturer")).toEqual({
			codes: ["CC-DEV-04", "CC-PRD-10"],
			method: "pentest",
		});
		expect(engagementControls("security_check", null)).toEqual({
			codes: ["CC-DEV-04"],
			method: "vuln_scan",
		});
		expect(engagementControls("cra_readiness", null)).toBeNull();
	});
});

describe("Bericht", () => {
	const finding = (over: Partial<ReportFinding> = {}): ReportFinding => ({
		id: "f1",
		title: "Fremde Bestellungen abrufbar | IDOR",
		severity: "critical",
		status: "open",
		cvss: 9.1,
		cvssVector: "CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:N",
		cwe: "CWE-639",
		cve: null,
		target: "https://staging.example.com",
		location: "/api/orders/{id}",
		description: "Die API prüft den Besitzer nicht.",
		steps: "GET /api/orders/2 mit Konto A",
		remediation: "Besitzer serverseitig prüfen.",
		retestStatus: "pending",
		retestedAt: null,
		retestNote: null,
		...over,
	});
	const input = {
		orgName: "Beispiel GmbH",
		exportLine: "> Vertraulich – exportiert von X",
		engagement: {
			code: "SA-2026-01",
			kind: "pentest" as const,
			title: "Pentest Web-App",
			status: "delivered" as const,
			scope: "Web-App mit zwei Rollen",
			targets: ["https://staging.example.com"],
			outOfScope: "Produktion",
			rulesOfEngagement: "Kein DoS",
			methodology: "OWASP WSTG",
			testerExternal: true,
			testerName: "Erika Muster",
			testerOrg: "Testhaus GmbH",
			startAt: "2026-11-02",
			endAt: "2026-11-06",
			summary: "Ein kritischer Befund, sonst solide.",
			result: "fail" as const,
			deliveredAt: new Date("2026-11-10T10:00:00Z"),
			retestDueAt: "2026-12-10",
			authorizedAt: new Date("2026-10-30T10:00:00Z"),
		},
		productLabel: null,
		authorization: { fileName: "beauftragung.pdf", sha256: "ab".repeat(32) },
		authorizedBy: "Max Owner",
		findings: [
			finding(),
			finding({
				id: "f2",
				severity: "low",
				status: "resolved",
				retestStatus: "passed",
				title: "Header fehlt",
			}),
		],
	};

	it("fünf Dateien, Kennzeichnung, Befund-Referenzen, Pipes entschärft", () => {
		const files = buildEngagementReport(input);
		expect(files.map((f) => f.name)).toEqual([
			"00_Management-Summary.md",
			"01_Umfang-und-Regeln.md",
			"02_Befunde.md",
			"03_Nachtest.md",
			"befunde.csv",
		]);
		const summary = String(files[0]?.data);
		expect(summary).toContain("> Vertraulich");
		expect(summary).toContain("| Ergebnis | nicht wirksam |");
		expect(summary).toContain("**F-01 Fremde Bestellungen abrufbar | IDOR**");
		expect(summary).toContain("kein Testat");
		expect(String(files[1]?.data)).toContain("beauftragung.pdf");
		expect(String(files[2]?.data)).toContain("## F-02 Header fehlt");
		expect(String(files[3]?.data)).toContain(
			"Fremde Bestellungen abrufbar \\| IDOR",
		);
		expect(String(files[4]?.data)).toContain("F-01;");
	});

	it("CRA-Readiness hängt den Prüfungsreife-Bericht an", () => {
		const files = buildEngagementReport({
			...input,
			readinessMarkdown: "# Prüfungsreife CRA",
		});
		expect(files.at(-1)?.name).toBe("04_CRA-Pruefungsreife.md");
	});
});
