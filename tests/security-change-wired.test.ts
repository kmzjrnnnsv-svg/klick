import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT, walkFiles } from "./helpers/walk";

// Vier-Augen (Härtung A4): jede kritische Änderung läuft über den Dienst in
// lib/security-changes, bevor sie wirkt. Muster wie role-assignments-effective:
// eine neue Stelle, die die Wirkung direkt auslöst, fällt hier auf.

type Wire = {
	file: string;
	// Funktion, in der der Aufruf stehen muss
	fn: string;
	// Aufruf des Vier-Augen-Dienstes
	gate: "requirePermit" | "requestApplyChange";
	// erste Stelle der eigentlichen Wirkung — muss nach dem Aufruf kommen
	effect: string;
};

const WIRES: Wire[] = [
	{
		file: "app/actions/sso.ts",
		fn: "saveSsoPolicyImpl",
		gate: "requestApplyChange",
		effect: ".set({ ssoPolicy",
	},
	{
		file: "app/actions/sso.ts",
		fn: "deleteSsoProviderImpl",
		gate: "requirePermit",
		effect: "auth.api.deleteSSOProvider",
	},
	{
		file: "app/actions/settings.ts",
		fn: "updateDlpPolicyImpl",
		gate: "requestApplyChange",
		effect: ".set({ dlpPolicy",
	},
	{
		file: "app/actions/ai-settings.ts",
		fn: "saveAiPolicyImpl",
		gate: "requestApplyChange",
		effect: ".set({ aiPolicy",
	},
	{
		file: "app/actions/signature-policy.ts",
		fn: "saveSignaturePolicyImpl",
		gate: "requestApplyChange",
		effect: ".set({ signaturePolicy",
	},
	{
		file: "app/actions/settings.ts",
		fn: "deleteOrganizationActionImpl",
		gate: "requirePermit",
		effect: "wipeOrganization(",
	},
	{
		file: "app/actions/settings.ts",
		fn: "resetOrganizationActionImpl",
		gate: "requirePermit",
		effect: "wipeOrganization(",
	},
	{
		file: "app/actions/team.ts",
		fn: "resetMemberAccessImpl",
		gate: "requirePermit",
		effect: "resetUserAccess(",
	},
	{
		file: "app/actions/integrations.ts",
		fn: "createAccessTokenImpl",
		gate: "requirePermit",
		effect: "newToken(",
	},
	{
		file: "app/actions/wallet-link.ts",
		fn: "connectWalletImpl",
		gate: "requirePermit",
		effect: "createWalletLink(",
	},
	{
		file: "app/actions/wallet-link.ts",
		fn: "renewWalletTokenImpl",
		gate: "requirePermit",
		effect: "renewWalletLinkToken(",
	},
	{
		file: "app/actions/team.ts",
		fn: "inviteMemberImpl",
		gate: "requirePermit",
		effect: "auth.api.createInvitation",
	},
	{
		file: "app/actions/team.ts",
		fn: "updateMemberRoleImpl",
		gate: "requirePermit",
		effect: "auth.api.updateMemberRole",
	},
	{
		file: "app/actions/team.ts",
		fn: "removeMemberImpl",
		gate: "requirePermit",
		effect: "auth.api.removeMember",
	},
	{
		file: "app/api/export/organisation.zip/route.ts",
		fn: "GET",
		gate: "requirePermit",
		effect: "buildZip(",
	},
];

// Rumpf einer Funktion: von „function <name>(“ bis zur nächsten
// Funktion bzw. zum nächsten Export auf oberster Ebene
function body(src: string, fn: string): string {
	const start = src.search(new RegExp(`function ${fn}\\(`));
	if (start < 0) return "";
	const rest = src.slice(start + 1);
	const next = rest.search(
		/\n(export |async function |function |const \w+ = )/,
	);
	return next < 0 ? rest : rest.slice(0, next);
}

describe("Vier-Augen ist an jeder kritischen Änderung angeschlossen", () => {
	for (const w of WIRES)
		it(`${w.file} ${w.fn}: ${w.gate} vor der Wirkung`, () => {
			const b = body(readFileSync(join(ROOT, w.file), "utf8"), w.fn);
			expect(b, `Funktion ${w.fn} nicht gefunden`).not.toBe("");
			const gate = b.indexOf(`${w.gate}(`);
			const effect = b.indexOf(w.effect);
			expect(gate, `${w.gate} fehlt`).toBeGreaterThan(-1);
			expect(effect, `Wirkung ${w.effect} fehlt`).toBeGreaterThan(-1);
			expect(gate).toBeLessThan(effect);
		});

	it("Organisation entfernen nur über wipeOrganization (nach dem Vier-Augen-Dienst)", () => {
		const callers = walkFiles(["app", "lib", "scripts"]).filter((f) =>
			readFileSync(join(ROOT, f), "utf8").includes("api.deleteOrganization("),
		);
		expect(callers).toEqual(["lib/org/wipe.ts"]);
		const users = walkFiles(["app", "lib", "scripts"]).filter(
			(f) =>
				f !== "lib/org/wipe.ts" &&
				readFileSync(join(ROOT, f), "utf8").includes("wipeOrganization("),
		);
		expect(users).toEqual(["app/actions/settings.ts"]);
	});

	it("SSO-, DLP-, Netz-, KI- und Unterschrifts-Regeln schreiben nur die Actions, der Dienst und der Notweg", () => {
		const allowed = new Set([
			"app/actions/sso.ts",
			"app/actions/settings.ts",
			// KI (ADR-032): strenger sofort, lockerer über Vier-Augen
			"app/actions/ai-settings.ts",
			// Einrichtung: nur die Einstufung, solange die KI aus ist
			"lib/ai/setup.ts",
			// Unterschriften nur mit Sicherheitsschlüssel (Verschärfen sofort)
			"app/actions/signature-policy.ts",
			"lib/security-changes/service.ts",
			// Notweg am Terminal (root, auditiert): IP-Liste ausschalten
			"scripts/org-network-reset.ts",
		]);
		const writers = walkFiles(["app", "lib", "scripts"])
			.filter((f) =>
				/\.set\(\{\s*(ssoPolicy|dlpPolicy|networkPolicy|aiPolicy|signaturePolicy)\b/.test(
					readFileSync(join(ROOT, f), "utf8"),
				),
			)
			.filter((f) => !allowed.has(f));
		expect(writers).toEqual([]);
	});

	it("IP-Liste: Aussperr-Schutz vor dem Antrag, kein direktes Schreiben", () => {
		const b = body(
			readFileSync(join(ROOT, "app/actions/network.ts"), "utf8"),
			"saveNetworkPolicyImpl",
		);
		const lock = b.indexOf("locksOut(");
		const gate = b.indexOf("requestApplyChange(");
		expect(lock).toBeGreaterThan(-1);
		expect(gate).toBeGreaterThan(lock);
		expect(b).not.toMatch(/\.set\(\{/);
	});
});
