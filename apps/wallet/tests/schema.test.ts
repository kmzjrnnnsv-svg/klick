import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as authSchema from "@wallet/db/auth-schema";
import * as appSchema from "@wallet/db/schema";
import { slugIssue } from "@wallet/lib/orgs/service";
import { databaseAllowed } from "@wallet/scripts/db-migrate";
import { describe, expect, it } from "vitest";
import { checkRls } from "@/db/rls";

const migration = readFileSync(
	join(import.meta.dirname, "../db/migrations/0000_init.sql"),
	"utf8",
);

describe("Schema both.money", () => {
	it("jede Org-Tabelle hat RLS und eine Policy, Auth-Tabellen haben keine Org", () => {
		const results = checkRls({ ...appSchema, ...authSchema });
		expect(results.map((r) => r.table).sort()).toEqual([
			"audit_log",
			"invitations",
			"members",
			"notifications",
			"org_settings",
		]);
		expect(results.filter((r) => !r.ok)).toEqual([]);
	});

	it("0000_init: nur wallet/wallet_test, FORCE für jede RLS-Tabelle, audit_log nur anhängend", () => {
		expect(migration).toContain(
			"current_database() NOT IN ('wallet', 'wallet_test')",
		);
		const enabled = [
			...migration.matchAll(
				/ALTER TABLE "([a-z_]+)" ENABLE ROW LEVEL SECURITY/g,
			),
		].map((m) => m[1]);
		const forced = [
			...migration.matchAll(
				/ALTER TABLE "([a-z_]+)" FORCE ROW LEVEL SECURITY/g,
			),
		].map((m) => m[1]);
		expect(enabled.length).toBeGreaterThanOrEqual(6);
		expect([...forced].sort()).toEqual([...enabled].sort());
		expect(migration).toContain("audit_log_no_mutation");
		expect(migration).toContain("app_current_user()");
	});

	it("Migration nur gegen wallet und wallet_test", () => {
		expect(databaseAllowed("wallet")).toBe(true);
		expect(databaseAllowed("wallet_test")).toBe(true);
		expect(databaseAllowed("klick")).toBe(false);
		expect(databaseAllowed("klick_test")).toBe(false);
		expect(databaseAllowed("")).toBe(false);
	});

	it("Kurzname", () => {
		expect(slugIssue("raza")).toBeNull();
		expect(slugIssue("both-money-gmbh")).toBeNull();
		expect(slugIssue("a")).toMatch(/Zeichen/);
		expect(slugIssue("Raza")).toMatch(/Zeichen/);
		expect(slugIssue("approve")).toBe("reserviert");
	});
});
