import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
	countSigners,
	releaseDecision,
	SIGNERS_FILE,
	signersSource,
} from "@/scripts/release-guard";

// Release-Wächter (Härtung H8): nur sauberer Arbeitsbaum; mit hinterlegtem
// Schlüssel nur signierte Tags.

const ROOT = resolve(import.meta.dirname, "..");

describe("countSigners", () => {
	it("zählt nur Zeilen mit Schlüssel", () => {
		expect(countSigners("# Kommentar\n\n")).toBe(0);
		expect(
			countSigners(
				'# x\nrelease namespaces="git" sk-ssh-ed25519@openssh.com AAAA…\n',
			),
		).toBe(1);
	});
});

describe("releaseDecision", () => {
	const clean = { status: "", tag: null, signers: 0, verified: false };

	it("ohne Schlüssel: sauberer Baum genügt, mit Hinweis", () => {
		const r = releaseDecision(clean);
		expect(r.ok).toBe(true);
		expect(r.warnings).toHaveLength(1);
	});

	it("geänderte Dateien brechen immer ab", () => {
		const r = releaseDecision({ ...clean, status: " M lib/env.ts\n?? x.ts\n" });
		expect(r.ok).toBe(false);
		expect(r.errors[0]).toContain("(2)");
	});

	it("mit Schlüssel: HEAD muss ein Tag sein", () => {
		expect(releaseDecision({ ...clean, signers: 1 }).ok).toBe(false);
	});

	it("mit Schlüssel: Tag ohne gültige Signatur bricht ab", () => {
		const r = releaseDecision({ ...clean, signers: 1, tag: "v2026.10.26" });
		expect(r.ok).toBe(false);
		expect(r.errors[0]).toContain("v2026.10.26");
	});

	it("mit Schlüssel: signierter Tag auf sauberem Baum geht durch", () => {
		const r = releaseDecision({
			...clean,
			signers: 2,
			tag: "v2026.10.26",
			verified: true,
		});
		expect(r).toEqual({ ok: true, errors: [], warnings: [] });
	});

	it("beide Releases laufen zuerst durch den Wächter", () => {
		const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));
		for (const s of ["release", "release:wallet"])
			expect(pkg.scripts[s]).toMatch(/^tsx scripts\/release-guard\.ts && /);
	});
});

describe("signersSource", () => {
	it("ohne Angabe gilt die Datei im Checkout", () => {
		expect(signersSource({}, "/opt/klick/current")).toEqual({
			path: `/opt/klick/current/${SIGNERS_FILE}`,
			external: false,
		});
	});

	it("root-eigener Anker außerhalb des Checkouts geht vor", () => {
		expect(
			signersSource(
				{ RELEASE_ALLOWED_SIGNERS: "/etc/klick-release/allowed_signers" },
				"/opt/klick/current",
			),
		).toEqual({ path: "/etc/klick-release/allowed_signers", external: true });
	});

	it("relativer Pfad ist ein Fehler, kein Rückfall", () => {
		expect(
			signersSource({ RELEASE_ALLOWED_SIGNERS: "allowed_signers" }, "/x"),
		).toBeNull();
	});
});
