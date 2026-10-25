import { getTableName, is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { OWNER_FUNCTION_TABLES } from "@/lib/compliance/function-owners";

// Jede Tabelle mit Verantwortlichen (owner_user_id) kann auch eine Funktion
// tragen (owner_function) und steht in OWNER_FUNCTION_TABLES — sonst
// rechnet syncFunctionOwners sie beim Umbesetzen nicht neu.

const tables = (Object.values(schema) as unknown[]).filter((v): v is PgTable =>
	is(v, PgTable),
);
const columns = (t: PgTable) => getTableConfig(t).columns.map((c) => c.name);

describe("Verantwortlich = Funktion oder Person", () => {
	it("jede Tabelle mit owner_user_id hat owner_function", () => {
		const missing = tables
			.filter((t) => columns(t).includes("owner_user_id"))
			.filter((t) => !columns(t).includes("owner_function"))
			.map((t) => getTableName(t));
		expect(missing).toEqual([]);
	});

	it("alle stehen in OWNER_FUNCTION_TABLES", () => {
		const listed = new Set<string>(
			OWNER_FUNCTION_TABLES.map((t) => getTableName(t)),
		);
		const missing = tables
			.filter((t) => columns(t).includes("owner_function"))
			.map((t) => getTableName(t))
			.filter((n) => !listed.has(n));
		expect(missing).toEqual([]);
	});
});
