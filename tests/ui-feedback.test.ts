import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { errorText } from "@/components/ui/error-text";
import { ROOT, walkFiles } from "./helpers/walk";

// Rückmeldungen nach den HIG (docs/design/hig.md, „Fehler und
// Rückmeldungen“): Fehler bleiben stehen, bis sie geschlossen werden, und
// sagen, was die Person tun kann — nie ein roher Code.

const files = walkFiles(
	[
		"app",
		"components",
		"lib",
		"apps/wallet/app",
		"apps/wallet/components",
		"apps/wallet/lib",
	],
	/\.(ts|tsx)$/,
);
const OWN = new Set(["components/ui/toast.ts", "components/ui/sonner.tsx"]);

describe("Rückmeldungen", () => {
	it("Toasts nur über components/ui/toast", () => {
		const hits = files.filter(
			(f) =>
				!OWN.has(f) &&
				/from "sonner"/.test(readFileSync(join(ROOT, f), "utf8")),
		);
		expect(hits).toEqual([]);
	});

	it("keine rohen Fehlercodes und kein bloßes „Fehler“", () => {
		const hits: string[] = [];
		for (const f of files) {
			const src = readFileSync(join(ROOT, f), "utf8");
			for (const [i, line] of src.split("\n").entries())
				if (
					/toast\.error\(\s*res\.error\s*(\)|\?\?|\|\|)/.test(line) ||
					/toast\.error\([^)]*"Fehler"/.test(line)
				)
					hits.push(`${f}:${i + 1}: ${line.trim()}`);
		}
		expect(hits).toEqual([]);
	});

	it("Fehlercode wird zum Satz mit nächstem Schritt", () => {
		const tc = (key: string, v?: { ref: string }) =>
			v ? `${key}:${v.ref}` : key;
		expect(errorText(tc, { ok: false, error: "forbidden" })).toBe(
			"errorForbidden",
		);
		expect(errorText(tc, { ok: false, error: "notFound" })).toBe(
			"errorNotFound",
		);
		expect(errorText(tc, { ok: false, error: "error", ref: "ab12" })).toBe(
			"errorRef:ab12",
		);
		expect(errorText(tc, { ok: false, error: "unbekannt" })).toBe("error");
		expect(errorText(tc, "Passkey wurde abgebrochen.")).toBe(
			"Passkey wurde abgebrochen.",
		);
		expect(errorText(tc)).toBe("error");
	});
});
