import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	legalDisplayName,
	legalEntityFrom,
	legalMailLines,
} from "@/lib/legal/entity";
import { PLATFORM_MAIL } from "@/lib/mail/address";

// Abmahnschutz (docs/legal/abmahn-audit-2026-10.md): Anbieterkennzeichnung
// aus einer Quelle, Rechtslinks in jedem Layout, Sprungziel, robots.txt.
const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

function walk(dir: string, out: string[]) {
	for (const name of readdirSync(join(ROOT, dir))) {
		const p = join(dir, name);
		if (statSync(join(ROOT, p)).isDirectory()) walk(p, out);
		else if (/\.tsx$/.test(name)) out.push(p);
	}
}

describe("Anbieterkennzeichnung", () => {
	const full = legalEntityFrom({
		LEGAL_NAME: "Raza",
		LEGAL_FORM: "GmbH",
		LEGAL_ADDRESS: "Musterstraße 1; 60311 Frankfurt am Main ;Deutschland",
		LEGAL_REPRESENTATIVES: "Erika Muster (Geschäftsführerin)",
		LEGAL_REGISTER: "Amtsgericht Frankfurt am Main, HRB 1",
		LEGAL_VAT_ID: "DE123456789",
		LEGAL_CONTACT_MAIL: PLATFORM_MAIL,
	});

	it("liest Adresse in Zeilen und meldet nichts als fehlend", () => {
		expect(full.address).toEqual([
			"Musterstraße 1",
			"60311 Frankfurt am Main",
			"Deutschland",
		]);
		expect(full.missing).toEqual([]);
		expect(legalDisplayName(full)).toBe("Raza GmbH");
	});

	it("nennt die Rechtsform nicht doppelt", () => {
		const e = legalEntityFrom({
			LEGAL_NAME: "Raza GmbH",
			LEGAL_FORM: "GmbH",
			LEGAL_CONTACT_MAIL: PLATFORM_MAIL,
		});
		expect(legalDisplayName(e)).toBe("Raza GmbH");
	});

	it("meldet fehlende Pflichtangaben, leere Werte zählen als fehlend", () => {
		const e = legalEntityFrom({
			LEGAL_NAME: "  ",
			LEGAL_CONTACT_MAIL: PLATFORM_MAIL,
		});
		expect(e.missing).toEqual([
			"LEGAL_NAME",
			"LEGAL_ADDRESS",
			"LEGAL_REPRESENTATIVES",
		]);
		expect(legalDisplayName(e)).toBeNull();
		expect(legalMailLines(e)).toEqual([]);
	});

	it("baut die Pflichtangaben für Mails (§ 35a GmbHG)", () => {
		expect(legalMailLines(full)).toEqual([
			"Raza GmbH, Musterstraße 1, 60311 Frankfurt am Main, Deutschland",
			"Vertreten durch Erika Muster (Geschäftsführerin)",
			"Amtsgericht Frankfurt am Main, HRB 1",
			"USt-IdNr. DE123456789",
		]);
	});

	it("Kontaktadresse ist ohne Env die Plattform-Adresse", async () => {
		const { envSchema } = await import("@/lib/env");
		const shape = envSchema.shape.LEGAL_CONTACT_MAIL;
		expect(shape.parse(undefined)).toBe(PLATFORM_MAIL);
	});
});

describe("Rechtslinks und Sprungziel in jedem Layout", () => {
	const files: string[] = [];
	walk("app", files);

	it("jedes Layout mit <main> zeigt Impressum und Datenschutz", () => {
		const layouts = files.filter(
			(f) => /layout\.tsx$/.test(f) && read(f).includes("<main"),
		);
		expect(layouts.length).toBeGreaterThan(4);
		for (const f of layouts)
			expect(
				/<LegalLinks|<Footer/.test(read(f)),
				`${f} ohne LegalLinks/Footer`,
			).toBe(true);
		expect(read("components/shell/app-shell.tsx")).toContain("<LegalLinks");
		expect(read("app/not-found.tsx")).toContain("<LegalLinks");
		// Layouts ohne eigenes <main> laufen durch AppShell (Wallet, App)
		for (const f of ["app/(app)/layout.tsx", "app/(wallet)/layout.tsx"])
			expect(read(f)).toContain("<AppShell");
	});

	it("jedes <main> ist Ziel des Sprunglinks", () => {
		const mains = [
			...files.filter((f) => !/(global-)?error\.tsx$/.test(f)),
			"components/shell/app-shell.tsx",
		].filter((f) => /<main[\s>]|as="main"/.test(read(f)));
		expect(mains.length).toBeGreaterThan(8);
		for (const f of mains)
			expect(read(f), `${f} ohne id="inhalt"`).toContain('id="inhalt"');
		expect(read("app/layout.tsx")).toContain('href="#inhalt"');
	});

	it("Fußzeile verlinkt Impressum, Datenschutz und Nutzungsbedingungen", () => {
		for (const f of [
			"components/shell/footer.tsx",
			"components/shell/legal-links.tsx",
		]) {
			const s = read(f);
			for (const href of [
				"/impressum",
				"/datenschutz-erklaerung",
				"/nutzungsbedingungen",
			])
				expect(s, `${f} ohne ${href}`).toContain(`"${href}"`);
		}
		const seed = read("db/seed.ts");
		for (const slug of [
			"impressum",
			"datenschutz-erklaerung",
			"nutzungsbedingungen",
		])
			expect(seed).toContain(`slug: "${slug}"`);
	});

	it("kein Link zur abgeschalteten OS-Plattform", () => {
		const all = [...files];
		walk("components", all);
		for (const f of all)
			expect(read(f), f).not.toMatch(/ec\.europa\.eu\/consumers\/odr/);
		expect(read("messages/de.json")).not.toMatch(/consumers\/odr/);
	});
});

describe("robots.txt", () => {
	const rules = read("public/robots.txt")
		.split("\n")
		.filter((l) => l.startsWith("Disallow:"))
		.map((l) => l.slice("Disallow:".length).trim());
	// Präfix-Regel, „$“ verankert das Ende (wie Google)
	const blocked = (path: string) =>
		rules.some((r) =>
			r.endsWith("$") ? path === r.slice(0, -1) : path.startsWith(r),
		);

	it("Rechtstexte und Marketing sind erreichbar", () => {
		for (const p of [
			"/",
			"/impressum",
			"/datenschutz-erklaerung",
			"/nutzungsbedingungen",
			"/preise",
			"/leistungen",
			"/funktionen",
			"/vertrauen",
		])
			expect(blocked(p), p).toBe(false);
	});

	it("App-Bereiche sind gesperrt", () => {
		for (const p of [
			"/datenschutz",
			"/heute",
			"/wallet",
			"/trust-center",
			"/verwahrung",
			"/api/anfrage",
		])
			expect(blocked(p), p).toBe(true);
	});
});
