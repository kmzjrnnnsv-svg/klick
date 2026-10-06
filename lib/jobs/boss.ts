import { PgBoss } from "pg-boss";
import { env } from "@/lib/env";
import { logger } from "@/lib/log";
import { registerJobs } from "./register";

// pg-boss: Postgres-nativer Scheduler (EU-Residency, keine Fremd-Infrastruktur).
// Das Schema `pgboss` gehört der App-Rolle (deploy/postgres/roles.sql), damit
// pg-boss seine Tabellen ohne DDL-Rechte auf public anlegen kann.

type G = { __klickBoss?: PgBoss; __klickBossStarted?: Promise<PgBoss> };
const g = globalThis as unknown as G;

export function getBoss(): PgBoss {
	if (!g.__klickBoss) {
		g.__klickBoss = new PgBoss({
			connectionString: env().DATABASE_URL,
			schema: "pgboss",
			application_name: "klick-jobs",
		});
		g.__klickBoss.on("error", (err: unknown) =>
			logger.error({ err }, "pg-boss error"),
		);
	}
	return g.__klickBoss;
}

// Einmal pro Prozess (HMR-Guard über globalThis).
export async function startScheduler(): Promise<PgBoss> {
	if (!g.__klickBossStarted) {
		g.__klickBossStarted = (async () => {
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
