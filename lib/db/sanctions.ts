// Legacy (bis K6): Wallet-Bereich in Klick, ersetzt durch both.money —
// Änderungen nur noch in apps/wallet/lib/db/sanctions.ts.
import { and, eq, ne } from "drizzle-orm";
import { globalDb } from "@/db";
import { sanctionedAddresses } from "@/db/schema";
import type { Chain } from "@/lib/wallet/core/networks";
import {
	type SanctionEntry,
	type SanctionSet,
	sanctionKey,
} from "@/lib/wallet/screening";

// Sperrliste für Adressen (Plattform-Tabelle ohne RLS). Lesen im Job
// wallet-sync, Schreiben nur über scripts/import-ofac-addresses.ts
// (Quelle `ofac`) bzw. später durch Plattform-Admins (`platform`).

export async function loadSanctionSet(): Promise<SanctionSet> {
	const rows = await globalDb
		.select({
			chain: sanctionedAddresses.chain,
			address: sanctionedAddresses.address,
			source: sanctionedAddresses.source,
			reference: sanctionedAddresses.reference,
		})
		.from(sanctionedAddresses);
	const map = new Map<string, SanctionEntry>();
	for (const r of rows)
		map.set(sanctionKey(r.chain, r.address), {
			source: r.source,
			reference: r.reference,
		});
	return map;
}

// Liste einer Quelle ersetzen: neue Einträge einfügen, entfallene löschen
// (eine Adresse, die die OFAC streicht, ist nicht mehr gesperrt).
export async function replaceSanctionList(input: {
	source: "ofac" | "platform";
	listVersion: string;
	entries: readonly { chain: Chain; address: string; reference: string }[];
}): Promise<{ inserted: number; removed: number; total: number }> {
	const norm = input.entries.map((e) => ({
		...e,
		address:
			e.chain === "ethereum" || /^(bc1|tb1)/i.test(e.address)
				? e.address.toLowerCase()
				: e.address.trim(),
	}));
	// Eine leere Liste ist ein Lesefehler, kein „alles entsperrt“
	if (norm.length === 0)
		throw new Error("Sperrliste leer — Import abgebrochen");
	return globalDb.transaction(async (tx) => {
		const before = new Set(
			(
				await tx
					.select({
						chain: sanctionedAddresses.chain,
						address: sanctionedAddresses.address,
					})
					.from(sanctionedAddresses)
					.where(eq(sanctionedAddresses.source, input.source))
			).map((r) => `${r.chain}:${r.address}`),
		);
		for (const e of norm)
			await tx
				.insert(sanctionedAddresses)
				.values({
					chain: e.chain,
					address: e.address,
					source: input.source,
					reference: e.reference,
					listVersion: input.listVersion,
				})
				.onConflictDoUpdate({
					target: [
						sanctionedAddresses.chain,
						sanctionedAddresses.address,
						sanctionedAddresses.source,
					],
					set: { reference: e.reference, listVersion: input.listVersion },
				});
		const removed = await tx
			.delete(sanctionedAddresses)
			.where(
				and(
					eq(sanctionedAddresses.source, input.source),
					ne(sanctionedAddresses.listVersion, input.listVersion),
				),
			)
			.returning({ id: sanctionedAddresses.id });
		const inserted = new Set(
			norm.map((e) => `${e.chain}:${e.address}`).filter((k) => !before.has(k)),
		).size;
		return { inserted, removed: removed.length, total: norm.length };
	});
}
