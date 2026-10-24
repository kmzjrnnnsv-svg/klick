import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { sqlClient } from "@wallet/db";
import { auditPlatform } from "@wallet/lib/audit";
import { replaceSanctionList } from "@wallet/lib/db/sanctions";
import { loadWalletEnvFiles } from "@wallet/lib/env";
import { parseOfacSdnXml } from "@/lib/wallet/ofac";

// both.money: Sperr-Adressen aus der OFAC-SDN-Liste übernehmen (eigener Import, kein
// Dienstleister). Ersetzt die Quelle „ofac“ vollständig: neue Adressen
// kommen dazu, gestrichene fallen weg. Eine leere oder kaputte Liste bricht
// ab, statt alles zu entsperren.
//
//   pnpm wallet:sanctions ./sdn.xml          # vorher heruntergeladene Datei
//   pnpm wallet:sanctions --fetch [url]      # direkt von der OFAC
//
// Standard-URL: OFAC Sanctions List Service (SDN.XML). Runbook:
// deploy/README.md → „both.money“. Jeder Import steht als
// sanctions.list_imported im Plattform-Protokoll von both.money.

const DEFAULT_URL =
	"https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.XML";

async function main() {
	loadWalletEnvFiles();
	const args = process.argv.slice(2);
	let xml: string;
	let origin: string;
	if (args[0] === "--fetch") {
		origin = args[1] ?? DEFAULT_URL;
		const res = await fetch(origin, { signal: AbortSignal.timeout(120_000) });
		if (!res.ok) throw new Error(`Download fehlgeschlagen: HTTP ${res.status}`);
		xml = await res.text();
	} else if (args[0]) {
		origin = args[0];
		xml = readFileSync(origin, "utf8");
	} else {
		console.error("Aufruf: pnpm wallet:sanctions <sdn.xml> | --fetch [url]");
		process.exit(2);
	}
	const parsed = parseOfacSdnXml(xml);
	if (parsed.entries === 0 || parsed.addresses.length === 0)
		throw new Error("Keine SDN-Einträge bzw. Adressen gefunden — Datei prüfen");
	const listVersion = `${parsed.publishDate ?? "?"}#${createHash("sha256").update(xml).digest("hex").slice(0, 12)}`;
	const result = await replaceSanctionList({
		source: "ofac",
		listVersion,
		entries: parsed.addresses,
	});
	await auditPlatform(
		{ userId: null, ip: null, userAgent: "cli" },
		{
			action: "sanctions.list_imported",
			target: "sanctioned_addresses:ofac",
			after: {
				listVersion,
				origin: origin.startsWith("http") ? origin : "datei",
				entries: parsed.entries,
				skipped: parsed.skipped,
				...result,
			},
		},
	);
	console.log(
		`✔ OFAC ${parsed.publishDate ?? ""}: ${result.total} Adressen (neu ${result.inserted}, entfernt ${result.removed}, übersprungen ${parsed.skipped})`,
	);
	await sqlClient.end();
}

main().catch(async (e) => {
	console.error(e instanceof Error ? e.message : e);
	await sqlClient.end().catch(() => {});
	process.exit(1);
});
