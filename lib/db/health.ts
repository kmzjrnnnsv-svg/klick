import { sql } from "drizzle-orm";
import { globalDb } from "@/db";

export async function pingDatabase(): Promise<boolean> {
	try {
		await globalDb.execute(sql`select 1`);
		return true;
	} catch {
		return false;
	}
}
