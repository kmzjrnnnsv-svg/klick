import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { type GlobalDb, schema } from "@/db";
import { mainDb } from "./job-scope";
import { poolConnection } from "./pool-options";

// Option „eigene Datenbank je Enterprise-Mandant“: ORG_DATABASE_URLS ist ein
// JSON-Objekt { "<orgId>": "postgres://…" }. withOrg/readOrg/mutateOrg wählen
// den Client je Org; alles andere (Better Auth, Katalog, Plattform-Jobs) bleibt
// auf der Haupt-DB. Dieselbe RLS-Policy gilt auch in der Enterprise-DB
// (Migrationen dort ebenso einspielen). Ohne Env: immer globalDb.

export function parseOrgDatabaseUrls(
	raw: string | undefined,
): Record<string, string> {
	if (!raw?.trim()) return {};
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new Error("ORG_DATABASE_URLS: kein gültiges JSON");
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
		throw new Error("ORG_DATABASE_URLS: Objekt { orgId: url } erwartet");
	const out: Record<string, string> = {};
	for (const [orgId, url] of Object.entries(
		parsed as Record<string, unknown>,
	)) {
		if (!/^[0-9a-f-]{36}$/i.test(orgId))
			throw new Error(`ORG_DATABASE_URLS: ${orgId} ist keine Org-UUID`);
		if (typeof url !== "string" || !/^postgres(ql)?:\/\//.test(url))
			throw new Error(
				`ORG_DATABASE_URLS: URL für ${orgId} muss mit postgres:// beginnen`,
			);
		out[orgId.toLowerCase()] = url;
	}
	return out;
}

const clients = new Map<string, GlobalDb>();
let routes: Record<string, string> | null = null;

export function dbForOrg(orgId: string): GlobalDb {
	if (!routes) routes = parseOrgDatabaseUrls(process.env.ORG_DATABASE_URLS);
	const url = routes[orgId.toLowerCase()];
	// Haupt-DB: im Job der Job-Pool (lib/db/job-scope.ts), sonst Web
	if (!url) return mainDb();
	let client = clients.get(url);
	if (!client) {
		client = drizzle(
			postgres(url, {
				max: 5,
				idle_timeout: 30,
				connect_timeout: 10,
				...connectionFor(),
			}),
			{ schema, casing: "snake_case" },
		) as unknown as GlobalDb;
		clients.set(url, client);
	}
	return client;
}

// Eigene DB einer Org: Zeitgrenzen wie der Web-Pool (auch Jobs nutzen ihn)
function connectionFor() {
	const connection = poolConnection("web");
	return connection ? { connection } : {};
}

// Nur für Tests.
export function resetDbRouterForTests(): void {
	routes = null;
	clients.clear();
}
