import { describe, expect, it } from "vitest";
import { ART30_CLAUSES } from "@/lib/compliance/catalog/art30-clauses";
import { buildAuditPackage, inPeriod } from "@/lib/export/audit-package";
import { buildSupplierPack } from "@/lib/export/supplier-pack";

const at = new Date("2026-10-07T10:00:00Z");

describe("Prüfungspaket", () => {
	const entries = buildAuditPackage({
		org: { id: "org-1", name: "Test GmbH" },
		generatedAt: at,
		period: { from: "2026-01-01", to: "2026-06-30" },
		frameworks: ["iso27001", "dora"],
		frameworkNames: { iso27001: "ISO 27001", dora: "DORA" },
		soaMarkdown: "# SoA\n",
		gap: [
			{ slug: "iso27001", header: ["a"], rows: [["x"]] },
			{ slug: "dora", header: ["a"], rows: [] },
		],
		controls: [
			{
				code: "CC-CRY-01",
				title: "Verschlüsselung",
				domain: "crypto",
				status: "implemented",
				ownerName: "Alex",
				assigneeName: null,
				nextReviewAt: "2027-01-01",
				note: null,
				evidenceCount: 0,
				lastTestResult: "pass",
			},
		],
		risks: { header: ["code"], rows: [["R-01"]] },
		documents: [
			{
				docNumber: "RL-001",
				title: "ISMS-Leitlinie",
				type: "policy",
				status: "published",
				classification: "internal",
				version: "1.1",
				ownerName: "Alex",
				nextReviewAt: null,
				versions: [
					{
						version: "1.0",
						publishedAt: new Date("2026-03-01T00:00:00Z"),
						approvedAt: new Date("2026-02-28T00:00:00Z"),
						approvedByName: "Kim",
						changeSummary: "Erstfassung",
						bodyMarkdown: "# Leitlinie\n\nText.",
						fileName: null,
						fileSha256: null,
					},
					{
						version: "1.1",
						publishedAt: new Date("2026-09-01T00:00:00Z"),
						approvedAt: null,
						approvedByName: null,
						changeSummary: "Nach Zeitraum",
						bodyMarkdown: "# Neu",
						fileName: null,
						fileSha256: null,
					},
				],
			},
			{
				docNumber: "KZ-009",
				title: "Schlüsselzeremonie",
				type: "concept",
				status: "published",
				classification: "secret",
				version: "1.0",
				ownerName: null,
				nextReviewAt: null,
				versions: [],
			},
		],
		evidence: [
			{
				id: "e1",
				title: "Pentest-Bericht",
				type: "attestation",
				classification: "confidential",
				fileName: "pentest.pdf",
				mimeType: "application/pdf",
				sizeBytes: 1234,
				sha256: "ab".repeat(32),
				url: null,
				validUntil: "2027-01-01",
				createdAt: at,
				createdByName: "Alex",
				controlCodes: ["CC-TST-02", "CC-CRY-01"],
			},
			{
				id: "e2",
				title: "HSM-Konfiguration",
				type: "config_export",
				classification: "secret",
				fileName: null,
				mimeType: null,
				sizeBytes: null,
				sha256: null,
				url: null,
				validUntil: null,
				createdAt: at,
				createdByName: null,
				controlCodes: [],
			},
		],
		incidents: [
			{
				code: "V-001",
				title: "Ausfall",
				awareAt: new Date("2026-02-01T08:00:00Z"),
				regimes: ["dora"],
				classification: "major",
				status: "closed",
				affectsPayments: true,
				initialDueAt: new Date("2026-02-01T12:00:00Z"),
				initialReportedAt: new Date("2026-02-01T11:00:00Z"),
				finalReportedAt: null,
				rootCause: "Netz",
				ownerName: "Alex",
			},
			{
				code: "V-002",
				title: "Später",
				awareAt: new Date("2026-08-01T08:00:00Z"),
				regimes: ["nis2"],
				classification: "minor",
				status: "open",
				affectsPayments: false,
				initialDueAt: null,
				initialReportedAt: null,
				finalReportedAt: null,
				rootCause: null,
				ownerName: null,
			},
		],
		auditLog: [
			{
				seq: "1",
				at,
				actorName: "Alex",
				action: "control.status",
				target: "control:CC-CRY-01",
				outcome: "success",
				prevHash: null,
				hash: "h1",
			},
		],
		chain: { ok: true, checked: 1 },
		audit: {
			title: "ISO Stage 2",
			type: "certification",
			status: "in_progress",
			auditors: ["Kim"],
			findings: [
				{
					severity: "minor",
					title: "Fehlender Nachweis",
					description: null,
					controlCode: "CC-CRY-01",
					requirementCode: "A.8.24",
					status: "open",
					ncCode: null,
					createdAt: at,
				},
			],
			requests: [
				{
					title: "Backup-Protokoll",
					status: "answered",
					controlCode: "CC-BCM-02",
					requirementCode: null,
					assigneeName: "Alex",
					dueAt: "2026-10-10",
					answeredAt: at,
					decidedAt: null,
					evidenceCount: 1,
				},
			],
		},
	});
	const names = entries.map((e) => e.name);
	const text = (n: string) => String(entries.find((e) => e.name === n)?.data);

	it("enthält alle Bausteine in fester Reihenfolge, README zuerst", () => {
		expect(names).toEqual([
			"README.md",
			"01-soa-iso27001.md",
			"02-gap-iso27001.csv",
			"02-gap-dora.csv",
			"03-controls.csv",
			"04-risiken.csv",
			"05-dokumente/RL-001-v1.0.md",
			"05-dokumente/index.csv",
			"06-nachweise-index.csv",
			"07-vorfaelle.csv",
			"08-audit-log.csv",
			"09-findings.csv",
			"10-nachweisanfragen.csv",
		]);
	});

	it("Zeitraum filtert Dokumentversionen und Vorfälle; secret nur gezählt", () => {
		const idx = text("05-dokumente/index.csv");
		expect(idx).toContain(
			"RL-001;ISMS-Leitlinie;policy;published;internal;1.0",
		);
		expect(idx).not.toContain(";1.1;");
		expect(idx).not.toContain("KZ-009");
		expect(text("05-dokumente/RL-001-v1.0.md")).toContain(
			"freigegeben von Kim",
		);
		const inc = text("07-vorfaelle.csv");
		expect(inc).toContain("V-001");
		expect(inc).not.toContain("V-002");
		const ev = text("06-nachweise-index.csv");
		expect(ev).toContain("Pentest-Bericht");
		expect(ev).toContain("CC-TST-02 CC-CRY-01");
		expect(ev).not.toContain("HSM-Konfiguration");
		const readme = text("README.md");
		expect(readme).toContain(
			"1 als „geheim“ klassifizierte Dokumente nicht enthalten",
		);
		expect(readme).toContain("1 geheime nicht enthalten");
		expect(readme).toContain("Hash-Kette: geprüft, 1 Einträge intakt");
		expect(readme).toContain("1 umgesetzt (1 ohne Nachweis)");
		expect(readme).toContain("Audit: ISO Stage 2");
	});

	it("Audit-Log ohne Feldwerte, Findings und Anfragen als CSV", () => {
		expect(text("08-audit-log.csv")).toContain(
			"1;2026-10-07T10:00:00.000Z;Alex;control.status;control:CC-CRY-01;success;;h1",
		);
		expect(text("09-findings.csv")).toContain(
			"minor;Fehlender Nachweis;;CC-CRY-01;A.8.24;open;;",
		);
		expect(text("10-nachweisanfragen.csv")).toContain(
			"Backup-Protokoll;answered;CC-BCM-02;;Alex;2026-10-10;",
		);
	});

	it("inPeriod: offen = alles, Grenzen inklusive", () => {
		expect(
			inPeriod(new Date("2026-06-30T23:00:00Z"), {
				from: "2026-01-01",
				to: "2026-06-30",
			}),
		).toBe(true);
		expect(
			inPeriod(new Date("2026-07-01T00:00:00Z"), {
				from: "2026-01-01",
				to: "2026-06-30",
			}),
		).toBe(false);
		expect(
			inPeriod(new Date("2025-12-31T23:59:59Z"), {
				from: "2026-01-01",
				to: null,
			}),
		).toBe(false);
		expect(inPeriod(new Date("2020-01-01T00:00:00Z"), null)).toBe(true);
		expect(inPeriod(null, { from: "2026-01-01", to: null })).toBe(true);
	});
});

describe("Lieferantenpaket", () => {
	const base = {
		org: {
			name: "Klick GmbH",
			lei: null,
			country: "DE",
			legalForm: "GmbH",
			registerNumber: "HRB 12345",
			sector: "other",
			licenceStage: "0_vorbereitung",
			caspServices: [],
			serviceDescription: "GRC-SaaS für regulierte Unternehmen",
		},
		generatedAt: at,
		evidence: [],
		insurance: [
			{
				type: "cyber",
				insurer: "Hiscox",
				policyRef: "CY-1",
				coverageLimit: "2000000.00",
				subLimits: { "Hot Wallet": 500000 },
				exclusions: "staatliche Akteure",
				validFrom: "2026-01-01",
				validUntil: "2026-12-31",
				hasEvidence: true,
			},
		],
		subcontractors: [
			{
				name: "Hetzner Online GmbH",
				country: "DE",
				serviceType: "hosting",
				serviceDescription: "Server",
				criticality: "critical",
				dataLocations: ["DE"],
				processesPersonalData: true,
				contractEnd: null,
			},
		],
		functions: [
			{
				code: "P-01",
				name: "Betrieb",
				criticality: "critical",
				rtoHours: 4,
				rpoHours: 1,
			},
			{
				code: "P-02",
				name: "Marketing",
				criticality: "standard",
				rtoHours: null,
				rpoHours: null,
			},
		],
		incidents: { last12Months: 2, major: 0, avgInitialReportHours: 3.5 },
		controlsImplemented: { total: 100, implemented: 60 },
		insuranceTypeLabel: { cyber: "Cyber" },
	};

	it("ohne Dokumente: Platzhalter statt Lücken, Art.-30-Tabelle vollständig", () => {
		const entries = buildSupplierPack({ ...base, documents: [] });
		const text = (n: string) => String(entries.find((e) => e.name === n)?.data);
		expect(entries.map((e) => e.name)).toEqual([
			"README.md",
			"01-registerdatenblatt.md",
			"02-art30-vertragsanhang.md",
			"03-ausstiegsplan.md",
			"04-notfallplan.md",
			"05-zertifikate-testate.md",
			"06-versicherungen.md",
			"07-subunternehmer.csv",
			"08-vorfallmeldung.md",
		]);
		expect(text("03-ausstiegsplan.md")).toContain(
			"Noch kein freigegebenes Dokument",
		);
		const art30 = text("02-art30-vertragsanhang.md");
		for (const c of ART30_CLAUSES) expect(art30).toContain(`| ${c.code}`);
		expect(art30).toContain("Ausstiegsplan in Arbeit");
		expect(text("01-registerdatenblatt.md")).toContain(
			"Handelsregister: HRB 12345",
		);
		expect(text("01-registerdatenblatt.md")).toContain(
			"| B_07.01 c0080 Ausstiegsplan vorhanden | Nein (in Arbeit) |",
		);
		expect(text("06-versicherungen.md")).toContain(
			"| Cyber | Hiscox | CY-1 | 2000000.00 | Hot Wallet: 500000 |",
		);
		expect(text("07-subunternehmer.csv")).toContain(
			"Hetzner Online GmbH;DE;hosting",
		);
		expect(text("08-vorfallmeldung.md")).toContain(
			"- P-01 Betrieb — RTO 4 h, RPO 1 h",
		);
		expect(text("08-vorfallmeldung.md")).not.toContain("P-02");
		expect(text("08-vorfallmeldung.md")).toContain("3.5 h");
	});

	it("mit freigegebenem Ausstiegsplan: Inhalt übernommen, geheime nur auf Anfrage", () => {
		const entries = buildSupplierPack({
			...base,
			org: { ...base.org, lei: "5299000HVJYR6QP3DK12" },
			documents: [
				{
					templateCode: "VA-EXIT-PLAN",
					docNumber: "VA-003",
					title: "Ausstiegsplan Hetzner",
					status: "published",
					version: "1.0",
					classification: "internal",
					publishedAt: new Date("2026-05-01T00:00:00Z"),
					bodyMarkdown: "## Schritte\n1. Rebuild",
					fileName: null,
					fileSha256: null,
				},
				{
					templateCode: "PL-NOTFALL",
					docNumber: "PL-002",
					title: "Notfallplan",
					status: "published",
					version: "2.0",
					classification: "secret",
					publishedAt: new Date("2026-05-01T00:00:00Z"),
					bodyMarkdown: "geheim",
					fileName: null,
					fileSha256: null,
				},
			],
		});
		const text = (n: string) => String(entries.find((e) => e.name === n)?.data);
		expect(text("03-ausstiegsplan.md")).toContain("1. Rebuild");
		expect(text("03-ausstiegsplan.md")).toContain(
			"VA-003 · Ausstiegsplan Hetzner · Version 1.0 · freigegeben 2026-05-01",
		);
		expect(text("04-notfallplan.md")).toContain("nur auf Anfrage unter NDA");
		expect(text("04-notfallplan.md")).not.toContain("geheim\n");
		expect(text("01-registerdatenblatt.md")).toContain(
			"5299000HVJYR6QP3DK12 (LEI)",
		);
		expect(text("02-art30-vertragsanhang.md")).toContain(
			"Ausstiegsstrategie VA-003",
		);
	});
});
