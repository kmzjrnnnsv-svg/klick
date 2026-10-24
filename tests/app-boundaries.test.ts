import { describe, expect, it } from "vitest";
import { importsOf, resolveSpec, WALLET_APP, walkFiles } from "./helpers/walk";

// Grenze zwischen Klick (Wurzel) und both.money (apps/wallet), Plan
// „both.money“: Beide Apps teilen nur reine Bausteine. Klick importiert nie
// aus apps/wallet; die geteilten Module importieren nur Geteiltes oder
// erlaubte Pakete; apps/wallet greift außerhalb des eigenen Ordners nur auf
// die geteilten Module zu — nie auf Klicks Datenbank, Auth oder Fachcode.

// Geteilte, reine Module (Repo-relativ, ohne Endung bzw. Ordner mit „/“)
const SHARED: readonly string[] = [
	"lib/wallet/core/",
	"lib/wallet/rpc/",
	"lib/wallet/sync/",
	"lib/wallet-link/",
	"lib/http/",
	"lib/wallet/model",
	"lib/wallet/display",
	"lib/wallet/intro",
	"lib/wallet/ofac",
	"lib/wallet/pair-names",
	"lib/wallet/prices",
	"lib/wallet/reconcile-source",
	"lib/wallet/return-path",
	"lib/wallet/screening",
	"lib/wallet/payouts/plan",
	"lib/wallet/signer/types",
	"db/columns",
	"db/rls",
	"lib/mail/send",
	"lib/mail/address",
	"lib/mail/html",
	"lib/legal/entity",
	"lib/audit-hash",
	"lib/auth/session-rules",
	"lib/auth/endpoint-policy",
	"lib/crypto/envelope",
	"lib/crypto/kms",
	"lib/crypto/fields",
];

// Zusätzlich für apps/wallet erlaubt (UI und Laufzeit-Helfer ohne Klick-DB)
const WALLET_EXTRA: readonly string[] = [
	"components/ui/",
	"lib/utils",
	"lib/log",
	"lib/rate-limit",
	"lib/observability/glitchtip",
	"signer/client",
	"styles/",
];

const SHARED_PACKAGES = [
	"node:",
	"@noble/",
	"@scure/",
	"micro-eth-signer",
	"zod",
	"drizzle-orm",
	"libsodium-wrappers",
	"nodemailer",
];

const within = (path: string, list: readonly string[]) =>
	list.some((p) =>
		p.endsWith("/")
			? path.startsWith(p)
			: path === p || path.replace(/\/index$/, "") === p,
	);

const strip = (p: string) => p.replace(/\.(ts|tsx|mjs|js)$/, "");

// Rein: Verstoß als Text oder null
function boundaryViolation(file: string, spec: string): string | null {
	const target = strip(resolveSpec(file, spec));
	const src = strip(file);
	const isPkg = target.startsWith("pkg:");
	const pkg = target.slice(4);
	const inWallet = src.startsWith(`${WALLET_APP}/`);
	const targetsWallet = !isPkg && target.startsWith(`${WALLET_APP}/`);

	if (!inWallet && targetsWallet)
		return `${file}: Klick importiert aus both.money (${spec})`;
	if (!inWallet && !isPkg && target.startsWith("apps/"))
		return `${file}: Import aus apps/ (${spec})`;

	if (within(src, SHARED)) {
		if (isPkg)
			return SHARED_PACKAGES.some((p) => pkg.startsWith(p))
				? null
				: `${file}: geteiltes Modul nutzt Paket ${pkg}`;
		return within(target, SHARED)
			? null
			: `${file}: geteiltes Modul greift auf ${target} zu`;
	}

	if (inWallet) {
		if (isPkg || targetsWallet) return null;
		return within(target, SHARED) || within(target, WALLET_EXTRA)
			? null
			: `${file}: both.money greift auf Klick-Code zu (${target})`;
	}
	return null;
}

describe("App-Grenze Klick ↔ both.money", () => {
	it("Regeln (Beispiele)", () => {
		expect(
			boundaryViolation("app/(app)/heute/page.tsx", "@wallet/lib/db/x"),
		).toMatch(/Klick importiert aus both.money/);
		expect(
			boundaryViolation("lib/compliance/x.ts", "../../apps/wallet/lib/y"),
		).toMatch(/Klick importiert aus both.money/);
		expect(
			boundaryViolation("lib/wallet/display.ts", "@/db/schema/wallet"),
		).toMatch(/geteiltes Modul greift/);
		expect(boundaryViolation("lib/wallet/core/x.ts", "pino")).toMatch(
			/nutzt Paket pino/,
		);
		expect(
			boundaryViolation("apps/wallet/lib/a.ts", "@/lib/auth/guards"),
		).toMatch(/both.money greift auf Klick-Code/);
		expect(boundaryViolation("apps/wallet/lib/a.ts", "@/db")).toMatch(
			/both.money greift auf Klick-Code/,
		);
		expect(
			boundaryViolation("apps/wallet/lib/a.ts", "@/lib/wallet/core/amount"),
		).toBeNull();
		expect(
			boundaryViolation("apps/wallet/app/page.tsx", "@/components/ui/button"),
		).toBeNull();
		expect(boundaryViolation("apps/wallet/lib/a.ts", "@wallet/db")).toBeNull();
		expect(boundaryViolation("lib/mail/send.ts", "./html")).toBeNull();
	});

	it("Quelltext hält die Grenze in beiden Richtungen", () => {
		const files = walkFiles([
			"app",
			"components",
			"lib",
			"db",
			"signer",
			WALLET_APP,
		]).filter((f) => !f.endsWith(".d.ts"));
		files.push("proxy.ts", "instrumentation.ts");
		const bad = files.flatMap((f) =>
			importsOf(f)
				.map((s) => boundaryViolation(f, s))
				.filter((v): v is string => v !== null),
		);
		expect(bad).toEqual([]);
	});
});
