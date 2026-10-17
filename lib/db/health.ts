import { sql } from "drizzle-orm";
import { globalDb } from "@/db";
import { dbForOrg, parseOrgDatabaseUrls } from "./router";

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
	Promise.race([
		p,
		new Promise<T>((_, reject) =>
			setTimeout(() => reject(new Error("timeout")), ms),
		),
	]);

export async function pingDatabase(timeoutMs = 3_000): Promise<boolean> {
	try {
		await withTimeout(globalDb.execute(sql`select 1`), timeoutMs);
		return true;
	} catch {
		return false;
	}
}

// Enterprise-Orgs mit eigener Datenbank (ORG_DATABASE_URLS): jede muss
// erreichbar sein, sonst sind deren Mitglieder ausgesperrt.
export async function pingOrgDatabases(
	timeoutMs = 3_000,
): Promise<{ total: number; failed: number }> {
	const routes = parseOrgDatabaseUrls(process.env.ORG_DATABASE_URLS);
	const orgIds = Object.keys(routes);
	const results = await Promise.all(
		orgIds.map(async (id) => {
			try {
				await withTimeout(dbForOrg(id).execute(sql`select 1`), timeoutMs);
				return true;
			} catch {
				return false;
			}
		}),
	);
	return { total: orgIds.length, failed: results.filter((ok) => !ok).length };
}
