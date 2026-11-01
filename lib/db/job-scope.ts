import { AsyncLocalStorage } from "node:async_hooks";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { type GlobalDb, globalDb, schema } from "@/db";
import { POOL_LIMITS, poolConnection } from "./pool-options";

// Eigener Verbindungspool für Hintergrund-Jobs (P4, Nov 2026).
//
// Web und Jobs teilten sich zehn Verbindungen: ein Tick über viele Orgs oder
// ein langsamer Export im Job ließ Seiten auf eine freie Verbindung warten.
// Jeder pg-boss-Handler läuft deshalb in runAsJob() (lib/jobs/register.ts);
// darin nehmen withOrg/readOrg/mutateOrg/withPlatform den Job-Pool mit vier
// Verbindungen und längeren Zeitgrenzen (lib/db/pool-options.ts). Orgs mit
// eigener Datenbank (ORG_DATABASE_URLS) bleiben bei ihrem Router-Pool.
// pg-boss selbst hat ohnehin einen eigenen Pool.

const scope = new AsyncLocalStorage<true>();

export function runAsJob<T>(fn: () => Promise<T>): Promise<T> {
	return scope.run(true, fn);
}

export function inJob(): boolean {
	return scope.getStore() === true;
}

const g = globalThis as unknown as { __klickJobsDb?: GlobalDb };

function createJobsDb(): GlobalDb {
	const url = process.env.DATABASE_URL ?? "postgres://localhost:5432/klick";
	const connection = poolConnection("jobs");
	return drizzle(
		postgres(url, {
			max: POOL_LIMITS.jobs.max,
			idle_timeout: 30,
			connect_timeout: 10,
			...(connection ? { connection } : {}),
		}),
		{ schema, casing: "snake_case" },
	) as unknown as GlobalDb;
}

// postgres.js verbindet erst bei der ersten Abfrage; der Pool entsteht
// beim ersten Job und überlebt im Dev Modul-Neuladungen.
export function jobsDb(): GlobalDb {
	g.__klickJobsDb ??= createJobsDb();
	return g.__klickJobsDb;
}

// Haupt-Datenbank für die laufende Arbeit: im Job der Job-Pool, sonst Web
export function mainDb(): GlobalDb {
	return inJob() ? jobsDb() : globalDb;
}
