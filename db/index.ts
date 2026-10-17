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

// Pool-Grenzen und Server-Timeouts (DB_POOL_MAX, DB_STATEMENT_TIMEOUT_MS,
// DB_IDLE_TX_TIMEOUT_MS): eine hängende Abfrage oder eine vergessene offene
// Transaktion blockiert sonst Verbindungen, bis der Pool leer ist. Das
// Idle-Limit liegt über dem S3-Timeout, weil Uploads in der Transaktion laufen.
export function poolOptions(defaultMax: number) {
	const num = (v: string | undefined, fallback: number) => {
		const n = Number(v);
		return v && Number.isFinite(n) && n >= 0 ? n : fallback;
	};
	return {
		max: num(process.env.DB_POOL_MAX, defaultMax),
		idle_timeout: 30,
		connect_timeout: 10,
		connection: {
			application_name: "klick",
			statement_timeout: num(process.env.DB_STATEMENT_TIMEOUT_MS, 60_000),
			idle_in_transaction_session_timeout: num(
				process.env.DB_IDLE_TX_TIMEOUT_MS,
				180_000,
			),
		},
	};
}

function createClient(): SqlClient {
	// postgres.js verbindet lazy — ohne Query keine Verbindung. Deshalb darf
	// hier ein Platzhalter stehen (Better-Auth-CLI, Typecheck ohne DB).
	const url = process.env.DATABASE_URL ?? "postgres://localhost:5432/klick";
	return postgres(url, poolOptions(10));
}

// HMR-Guard: in Dev überlebt der Pool Modul-Neuladungen.
export const sqlClient: SqlClient = g.__klickSql ?? createClient();
if (process.env.NODE_ENV !== "production") g.__klickSql = sqlClient;

export const globalDb = drizzle(sqlClient, { schema, casing: "snake_case" });

export type GlobalDb = typeof globalDb;
export type DbTx = Parameters<Parameters<GlobalDb["transaction"]>[0]>[0];
