// Bare Datenbank-Client OHNE Mandanten-Kontext.
//
// Importe von "@/db" sind per Biome (noRestrictedImports) auf lib/db/*,
// lib/auth/*, lib/jobs/*, db/* und scripts/* beschränkt. Fachcode arbeitet
// ausschließlich über withOrg()/readOrg()/withPlatform() aus lib/db/with-org,
// die den RLS-Kontext (app.org_id) transaktionslokal setzen.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { ensureEnvLoaded } from "../lib/env";
import * as authSchema from "./auth-schema";
import * as appSchema from "./schema";

ensureEnvLoaded();

export const schema = { ...authSchema, ...appSchema };

type SqlClient = ReturnType<typeof postgres>;

const g = globalThis as unknown as { __klickSql?: SqlClient };

function createClient(): SqlClient {
	// postgres.js verbindet lazy — ohne Query keine Verbindung. Deshalb darf
	// hier ein Platzhalter stehen (Better-Auth-CLI, Typecheck ohne DB).
	const url = process.env.DATABASE_URL ?? "postgres://localhost:5432/klick";
	return postgres(url, { max: 10, idle_timeout: 30, connect_timeout: 10 });
}

// HMR-Guard: in Dev überlebt der Pool Modul-Neuladungen.
export const sqlClient: SqlClient = g.__klickSql ?? createClient();
if (process.env.NODE_ENV !== "production") g.__klickSql = sqlClient;

export const globalDb = drizzle(sqlClient, { schema, casing: "snake_case" });

export type GlobalDb = typeof globalDb;
export type DbTx = Parameters<Parameters<GlobalDb["transaction"]>[0]>[0];
