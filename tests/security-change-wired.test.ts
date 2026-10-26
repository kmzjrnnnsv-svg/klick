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
		file: "app/actions/settings.ts",
		fn: "deleteOrganizationActionImpl",
		gate: "requirePermit",
		effect: "auth.api.deleteOrganization",
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

	it("SSO- und DLP-Regeln schreiben nur die Actions und der Dienst", () => {
		const allowed = new Set([
			"app/actions/sso.ts",
			"app/actions/settings.ts",
			"lib/security-changes/service.ts",
		]);
		const writers = walkFiles(["app", "lib", "scripts"])
			.filter((f) =>
				/\.set\(\{\s*(ssoPolicy|dlpPolicy)\b/.test(
					readFileSync(join(ROOT, f), "utf8"),
				),
			)
			.filter((f) => !allowed.has(f));
		expect(writers).toEqual([]);
	});
});
