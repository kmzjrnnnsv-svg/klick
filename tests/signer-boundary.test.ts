import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSigner, SIGNER_ALLOWED_PACKAGES } from "@/scripts/build-signer";

// Grenze des Signers: nur node:*, @noble/@scure, micro-eth-signer und
// lib/wallet/core — keine Datenbank, keine Auth, kein Netz-Code der App.

const ROOT = resolve(import.meta.dirname, "..");

const importsOf = (file: string) =>
	[...readFileSync(file, "utf8").matchAll(/from\s+"([^"]+)"/g)].map(
		(m) => m[1] as string,
	);

function allowed(spec: string, dir: "signer" | "core") {
	if (spec.startsWith("node:")) return true;
	if (
		SIGNER_ALLOWED_PACKAGES.some((p) => spec === p || spec.startsWith(`${p}/`))
	)
		return true;
	if (dir === "signer")
		return spec.startsWith("./") || spec.startsWith("../lib/wallet/core/");
	return spec.startsWith("./");
}

describe("Signer-Grenze", () => {
	it("Quelltext: signer/* und lib/wallet/core/* importieren nur Erlaubtes", () => {
		const bad: string[] = [];
		for (const [dir, path] of [
			["signer", join(ROOT, "signer")],
			["core", join(ROOT, "lib/wallet/core")],
		] as const)
			for (const f of readdirSync(path).filter((x) => x.endsWith(".ts")))
				for (const spec of importsOf(join(path, f)))
					if (!allowed(spec, dir)) bad.push(`${dir}/${f}: ${spec}`);
		expect(bad).toEqual([]);
	});

	it("Bündel: nur erlaubte Eingaben, __DEV__ fest eingesetzt", async () => {
		const out = join(
			mkdtempSync(join(tmpdir(), "klick-signer-build-")),
			"s.mjs",
		);
		const { bad, inputs } = await buildSigner({ dev: false, outfile: out });
		expect(bad).toEqual([]);
		expect(inputs.some((i) => i.startsWith("lib/db"))).toBe(false);
		const code = readFileSync(out, "utf8");
		expect(code).not.toMatch(/__DEV__/);
		expect(code).not.toMatch(/simplewebauthn|drizzle|better-auth|\bpg\b/);
	}, 60_000);
});
