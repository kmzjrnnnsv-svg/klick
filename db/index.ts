import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { ensureEnvLoaded } from "../lib/env";
import * as schema from "./schema";

// Next.js already injects .env.local at boot; standalone scripts (seed,
// db:migrate, set-role) need the loader to also pick up .env.production.
ensureEnvLoaded();

if (!process.env.DATABASE_URL) {
	throw new Error("DATABASE_URL is required");
}

const client = postgres(process.env.DATABASE_URL, { max: 10 });

export const db = drizzle(client, { schema, casing: "snake_case" });
