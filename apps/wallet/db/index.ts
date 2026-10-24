// Datenbank-Client von both.money OHNE Org-Kontext. Importe von "@wallet/db"
// sind per Biome auf lib/db, lib/auth, lib/jobs, db, scripts und tests
// beschränkt; Fachcode arbeitet über withOrg()/readOrg()/withPlatform()
// (lib/db/with-org.ts), die den RLS-Kontext transaktionslokal setzen.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { ensureWalletEnvLoaded } from "../lib/env";
import * as authSchema from "./auth-schema";
import * as appSchema from "./schema";

ensureWalletEnvLoaded();

export const schema = { ...authSchema, ...appSchema };

type SqlClient = ReturnType<typeof postgres>;

const g = globalThis as unknown as { __walletSql?: SqlClient };

function createClient(): SqlClient {
	// Verbindet lazy — der Platzhalter erlaubt Typecheck und Build ohne DB.
	const url =
		process.env.WALLET_DATABASE_URL ?? "postgres://localhost:5432/wallet";
	return postgres(url, { max: 10, idle_timeout: 30, connect_timeout: 10 });
}

export const sqlClient: SqlClient = g.__walletSql ?? createClient();
if (process.env.NODE_ENV !== "production") g.__walletSql = sqlClient;

export const db = drizzle(sqlClient, { schema, casing: "snake_case" });

export type WalletDb = typeof db;
export type DbTx = Parameters<Parameters<WalletDb["transaction"]>[0]>[0];
