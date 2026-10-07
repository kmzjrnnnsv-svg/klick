import { syncCatalog } from "../lib/compliance/catalog/seed-catalog";
import { validateEnv } from "../lib/env";
import { globalDb, sqlClient } from "./index";

// `pnpm db:seed` — idempotent. Keine Default-Organisation mehr: Organisationen
// entstehen über /onboarding (DEK, Baseline, Anwendbarkeit laufen durch die
// Action). Erster Plattform-Admin: Carry-over aus der Migration oder
// `pnpm dlx auth@latest create-admin --email <email> --role admin`.
async function main() {
	validateEnv();
	const s = await syncCatalog(globalDb);
	console.log(
		`✔ Katalog synchronisiert: ${s.frameworks} Rahmenwerke, ${s.sections} Sections, ${s.requirements} Anforderungen, ${s.controls} Controls, ${s.edges} Kanten.`,
	);
	if (s.unresolvedEdges.length > 0) {
		console.warn(`⚠ ${s.unresolvedEdges.length} Kanten nicht auflösbar:`);
		for (const e of s.unresolvedEdges) console.warn(`  ${e}`);
		process.exitCode = 1;
	}
}

main()
	.catch((err) => {
		console.error("✗ Seed fehlgeschlagen:", err);
		process.exitCode = 1;
	})
	.finally(() => sqlClient.end({ timeout: 5 }));
