import { syncCatalog } from "../lib/compliance/catalog/seed-catalog";
import { validateEnv } from "../lib/env";
import { globalDb, sqlClient } from "./index";
import { cmsPages } from "./schema";

// Rechtstexte, auf die der Footer verlinkt: ohne Seite liefe der Link ins
// Leere (404). Platzhalter werden nur angelegt, wenn der Slug fehlt — Inhalte
// pflegt der Plattform-Admin unter /admin/cms.
const CMS_PLACEHOLDERS = [
	{
		slug: "impressum",
		title: "Impressum",
		body: "Dieses Impressum ist noch nicht ausgefüllt. Der Plattform-Admin trägt die Angaben nach § 5 DDG unter Admin → CMS ein.",
	},
	{
		slug: "datenschutz-erklaerung",
		title: "Datenschutzerklärung",
		body: "Diese Datenschutzerklärung ist noch nicht ausgefüllt. Der Plattform-Admin trägt die Angaben nach Art. 13 DSGVO unter Admin → CMS ein.",
	},
];

async function ensureCmsPlaceholders(): Promise<number> {
	const rows = await globalDb
		.insert(cmsPages)
		.values(CMS_PLACEHOLDERS)
		.onConflictDoNothing({ target: cmsPages.slug })
		.returning({ slug: cmsPages.slug });
	return rows.length;
}

// `pnpm db:seed` — idempotent. Keine Default-Organisation mehr: Organisationen
// entstehen über /onboarding (DEK, Baseline, Anwendbarkeit laufen durch die
// Action). Erster Plattform-Admin: Carry-over aus der Migration oder
// `pnpm dlx auth@latest create-admin --email <email> --role admin`.
async function main() {
	validateEnv();
	const cms = await ensureCmsPlaceholders();
	if (cms > 0)
		console.log(`✔ ${cms} CMS-Platzhalter angelegt (Impressum/Datenschutz).`);
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
