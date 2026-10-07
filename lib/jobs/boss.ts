import { sql } from "drizzle-orm";
import { getConstructionPlans, PgBoss } from "pg-boss";
import { globalDb, sqlClient } from "@/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/log";
import { registerJobs } from "./register";

// pg-boss: Postgres-nativer Scheduler (EU-Residency, keine Fremd-Infrastruktur).
// Das Schema `pgboss` gehört der App-Rolle (deploy/postgres/roles.sql bzw.
// init-dev.sql), damit pg-boss seine Tabellen ohne DDL-Rechte auf public
// anlegen kann. Die Erstinstallation läuft über ensureInstalled(): pg-boss
// würde sonst `CREATE SCHEMA IF NOT EXISTS pgboss` ausführen, und Postgres
// verlangt dafür CREATE auf der Datenbank — auch wenn das Schema längst
// existiert. Genau dieses Recht hat klick_app bewusst nicht (ADR-010).

const SCHEMA = "pgboss";

type G = { __klickBoss?: PgBoss; __klickBossStarted?: Promise<PgBoss> };
const g = globalThis as unknown as G;

export function getBoss(): PgBoss {
	if (!g.__klickBoss) {
		g.__klickBoss = new PgBoss({
			connectionString: env().DATABASE_URL,
			schema: SCHEMA,
			application_name: "klick-jobs",
		});
		g.__klickBoss.on("error", (err: unknown) =>
			logger.error({ err }, "pg-boss error"),
		);
	}
	return g.__klickBoss;
}

// Erstinstallation der pg-boss-Tabellen im bestehenden Schema (ohne CREATE
// SCHEMA). Spätere Versionswechsel migriert pg-boss beim Start selbst — die
// Migrationspläne enthalten kein CREATE SCHEMA.
export async function ensureInstalled(): Promise<"installed" | "present"> {
	const [row] = await globalDb.execute<{ name: string | null }>(
		sql`select to_regclass(${`${SCHEMA}.version`})::text as name`,
	);
	if (row?.name) return "present";
	// Der Plan ist ein BEGIN…COMMIT-Skript mit Advisory-Lock; postgres.js
	// erlaubt das nur auf einer reservierten Verbindung (nicht im Pool).
	const plan = getConstructionPlans(SCHEMA, { createSchema: false });
	const conn = await sqlClient.reserve();
	try {
		await conn.unsafe(plan);
	} finally {
		conn.release();
	}
	logger.info({ schema: SCHEMA }, "pg-boss schema installed");
	return "installed";
}

// Einmal pro Prozess (HMR-Guard über globalThis).
export async function startScheduler(): Promise<PgBoss> {
	if (!g.__klickBossStarted) {
		g.__klickBossStarted = (async () => {
			await ensureInstalled();
			const boss = getBoss();
			await boss.start();
			await registerJobs(boss);
			logger.info("scheduler started");
			return boss;
		})().catch((err) => {
			g.__klickBossStarted = undefined;
			throw err;
		});
	}
	return g.__klickBossStarted;
}

export async function stopScheduler(): Promise<void> {
	if (g.__klickBoss) {
		await g.__klickBoss.stop({ graceful: true, timeout: 10_000 });
		g.__klickBoss = undefined;
		g.__klickBossStarted = undefined;
	}
}
