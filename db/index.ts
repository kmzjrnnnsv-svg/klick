import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Idempotent: dotenv won't overwrite vars that are already set
// (Next.js loads .env.local at boot; standalone scripts pick it up here).
config({ path: ".env.local" });
config({ path: ".env" });

if (!process.env.DATABASE_URL) {
	throw new Error("DATABASE_URL is required");
}

const client = postgres(process.env.DATABASE_URL, { max: 10 });

export const db = drizzle(client, { schema, casing: "snake_case" });
