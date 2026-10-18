import { describe, expect, it } from "vitest";
import {
	deTaxIdValid,
	ibanValid,
	isServiceRoleJwt,
	luhnValid,
	scanText,
} from "@/lib/dlp/detectors";
import { extractText, xmlToText } from "@/lib/dlp/extract";
import { DEFAULT_DLP_POLICY, evaluateDlp } from "@/lib/dlp/policy";
import { buildZip } from "@/lib/export/zip";
import { readZipEntries } from "@/lib/uploads/zip-read";

// Geheimnis-förmige Testdaten werden zur Laufzeit zusammengesetzt, damit
// gitleaks im Repo keine Funde meldet.
const AWS = `${"AKIA"}${"Q".repeat(16)}`;
const STRIPE = `${"sk_"}${"live_"}${"a1B2c3D4".repeat(3)}`;
const PEM = `-----BEGIN ${"RSA "}PRIVATE KEY-----\nMIIB\n-----END RSA PRIVATE KEY-----`;
const jwt = (claims: object) =>
	[
		Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
			"base64url",
		),
		Buffer.from(JSON.stringify(claims)).toString("base64url"),
		"x".repeat(43),
	].join(".");

const DOCX =
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document";

describe("Prüfziffern", () => {
	it("Luhn, IBAN mod 97, Steuer-ID", () => {
		expect(luhnValid("4111111111111111")).toBe(true);
		expect(luhnValid("4111111111111112")).toBe(false);
		expect(ibanValid("DE89 3704 0044 0532 0130 00")).toBe(true);
		expect(ibanValid("DE89 3704 0044 0532 0130 01")).toBe(false);
		expect(deTaxIdValid("86095742719")).toBe(true);
		expect(deTaxIdValid("86095742718")).toBe(false);
		expect(deTaxIdValid("12345678901")).toBe(false);
	});

	it("Supabase: nur service_role ist ein Fund, anon nicht", () => {
		expect(isServiceRoleJwt(jwt({ role: "service_role" }))).toBe(true);
		expect(isServiceRoleJwt(jwt({ role: "anon" }))).toBe(false);
	});
});

describe("scanText", () => {
	it("findet Secrets und zählt, ohne Inhalt zurückzugeben", () => {
		const f = scanText(
			`aws=${AWS}\nstripe=${STRIPE}\n${PEM}\nkey=${jwt({ role: "service_role" })}\nanon=${jwt({ role: "anon" })}`,
		);
		const by = Object.fromEntries(f.map((x) => [x.detector, x.count]));
		expect(by).toMatchObject({
			aws_access_key: 1,
			stripe_secret: 1,
			private_key: 1,
			supabase_service_role: 1,
		});
		expect(JSON.stringify(f)).not.toContain(AWS);
	});

	it("Bank- und Zahlungsdaten nur mit gültiger Prüfziffer", () => {
		const f = scanText(
			"IBAN DE89 3704 0044 0532 0130 00, falsch DE89 3704 0044 0532 0130 01, Karte 4111 1111 1111 1111, Bestellnr 1234567890123",
		);
		const by = Object.fromEntries(f.map((x) => [x.detector, x.count]));
		expect(by.iban).toBe(1);
		expect(by.card_number).toBe(1);
	});

	it("Massen-PII zählt eindeutige Adressen", () => {
		const text = Array.from({ length: 60 }, (_, i) => `p${i}@example.org`).join(
			"\n",
		);
		const f = scanText(`${text}\np1@example.org`);
		expect(f.find((x) => x.detector === "email")?.count).toBe(60);
	});

	it("lange Zeichenketten ohne Treffer bleiben linear (kein Backtracking)", () => {
		// vorher: 200 000 Zeichen ≈ 50 s in der E-Mail-Regex
		for (const unit of ["y", "1", "a.", "1-", "+4", "AB", "eyJ"]) {
			const t = performance.now();
			expect(scanText(unit.repeat(200_000))).toEqual([]);
			expect(performance.now() - t).toBeLessThan(1500);
		}
		// Adressen werden weiter erkannt, auch direkt nach Satzzeichen
		const f = scanText("mailto:max.muster@firma.de, (info@beispiel.org)");
		expect(f.find((x) => x.detector === "email")?.count).toBe(2);
	});

	it("normale Richtlinie ohne Funde", () => {
		expect(
			scanText(
				"Informationssicherheitsleitlinie, Version 2.1, gültig ab 01.01.2026. Kontakt: isb@example.org",
			).filter((x) => x.category !== "pii"),
		).toEqual([]);
	});
});

describe("evaluateDlp", () => {
	it("Secrets blockieren standardmäßig", () => {
		const d = evaluateDlp(
			[{ detector: "aws_access_key", category: "secret", count: 1 }],
			DEFAULT_DLP_POLICY,
			"internal",
		);
		expect(d.action).toBe("block");
	});

	it("Zahlungsdaten heben auf secret an, nie herab", () => {
		const d = evaluateDlp(
			[{ detector: "card_number", category: "payment", count: 3 }],
			DEFAULT_DLP_POLICY,
			"internal",
		);
		expect(d).toMatchObject({
			action: "raise",
			classification: "secret",
			raised: true,
		});
		const keep = evaluateDlp(
			[{ detector: "iban", category: "bank", count: 1 }],
			DEFAULT_DLP_POLICY,
			"secret",
		);
		expect(keep.classification).toBe("secret");
		expect(keep.raised).toBe(false);
	});

	it("PII erst ab Schwelle; Regel warn verlangt Bestätigung", () => {
		const few = evaluateDlp(
			[{ detector: "email", category: "pii", count: 3 }],
			DEFAULT_DLP_POLICY,
			"internal",
		);
		expect(few.action).toBe("allow");
		const warn = evaluateDlp(
			[{ detector: "aws_access_key", category: "secret", count: 1 }],
			{ ...DEFAULT_DLP_POLICY, secret: "warn" },
			"internal",
		);
		expect(warn).toMatchObject({ action: "warn", classification: "secret" });
	});

	it("info-Funde (Google-Maps-Key) lösen nichts aus", () => {
		const d = evaluateDlp(
			[{ detector: "google_api_key", category: "info", count: 1 }],
			DEFAULT_DLP_POLICY,
			"internal",
		);
		expect(d.action).toBe("allow");
	});
});

describe("ZIP-Leser und Office-Extraktion", () => {
	const docx = buildZip([
		{ name: "[Content_Types].xml", data: "<Types/>" },
		{
			name: "word/document.xml",
			data: `<w:document><w:body><w:p><w:r><w:t>Zugang: ${AWS}</w:t></w:r></w:p><w:p><w:r><w:t>A &amp; B</w:t></w:r></w:p></w:body></w:document>`,
		},
	]);

	it("liest Einträge und extrahiert Text aus docx", () => {
		const z = readZipEntries(docx, (n) => n.startsWith("word/"));
		expect(z.ok && z.entries.map((e) => e.name)).toEqual(["word/document.xml"]);
		const x = extractText(docx, DOCX);
		expect(x.status).toBe("ok");
		if (x.status === "ok") {
			expect(x.text).toContain("A & B");
			expect(scanText(x.text).map((f) => f.detector)).toContain(
				"aws_access_key",
			);
		}
	});

	it("xmlToText trennt Absätze und Zellen", () => {
		expect(xmlToText("<w:p><w:t>a</w:t></w:p><w:p><w:t>b</w:t></w:p>")).toBe(
			"a\nb\n",
		);
	});

	it("Zip-Bombe: Kompressionsrate wird abgelehnt", () => {
		const bomb = new Uint8Array(4 * 1024 * 1024); // 4 MB Nullen
		const zipped = buildZip([{ name: "word/document.xml", data: bomb }]);
		const z = readZipEntries(zipped, () => true);
		expect(z).toEqual({ ok: false, reason: "ratio" });
	});

	it("kein ZIP, unbekannte Formate", () => {
		expect(readZipEntries(new Uint8Array(40), () => true)).toEqual({
			ok: false,
			reason: "not_zip",
		});
		expect(extractText(new Uint8Array([1, 2]), "application/pdf")).toEqual({
			status: "unsupported",
		});
	});
});
