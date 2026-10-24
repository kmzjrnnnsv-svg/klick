import { db, sqlClient } from "@wallet/db";
import { sql } from "drizzle-orm";
import { getConstructionPlans, PgBoss } from "pg-boss";
import { logger } from "@/lib/log";
import { registerJobs } from "./register";

// pg-boss in der eigenen Datenbank von both.money (Schema pgboss gehört
// wallet_app; Installation ohne CREATE SCHEMA wie bei Klick).

const SCHEMA = "pgboss";

type G = { __walletBoss?: PgBoss; __walletBossStarted?: Promise<PgBoss> };
const g = globalThis as unknown as G;

function getBoss(): PgBoss {
	if (!g.__walletBoss) {
		g.__walletBoss = new PgBoss({
			connectionString: process.env.WALLET_DATABASE_URL,
			schema: SCHEMA,
			application_name: "both-jobs",
		});
		g.__walletBoss.on("error", (err: unknown) =>
			logger.error({ err }, "pg-boss error"),
		);
	}
	return g.__walletBoss;
}

async function ensureInstalled(): Promise<void> {
	const [row] = await db.execute<{ name: string | null }>(
		sql`select to_regclass(${`${SCHEMA}.version`})::text as name`,
	);
	if (row?.name) return;
	const conn = await sqlClient.reserve();
	try {
		await conn.unsafe(getConstructionPlans(SCHEMA, { createSchema: false }));
	} finally {
		conn.release();
	}
	logger.info({ schema: SCHEMA }, "pg-boss schema installed");
}

export async function startScheduler(): Promise<PgBoss> {
	if (!g.__walletBossStarted) {
		g.__walletBossStarted = (async () => {
			await ensureInstalled();
			const boss = getBoss();
			await boss.start();
			await registerJobs(boss);
			logger.info("both.money scheduler started");
			return boss;
		})().catch((err) => {
			g.__walletBossStarted = undefined;
			throw err;
		});
	}
	return g.__walletBossStarted;
}
