import { describe, expect, it } from "vitest";
import * as authSchema from "@/db/auth-schema";
import { checkRls } from "@/db/rls";
import * as appSchema from "@/db/schema";

// Schema-Lint (läuft immer, ohne DB): jede Tabelle mit organization_id trägt
// RLS + Policy. Better-Auth-Tabellen liest der Adapter ohne Org-Kontext —
// sie sind die einzigen begründeten Ausnahmen (member, invitation, sso_provider).
const AUTH_TABLES_WITHOUT_RLS = new Set([
	"member",
	"invitation",
	"sso_provider",
]);

describe("isolation matrix (schema)", () => {
	const results = checkRls(
		{ ...appSchema, ...authSchema },
		AUTH_TABLES_WITHOUT_RLS,
	);

	it("findet die Org-Tabellen", () => {
		expect(results.length).toBeGreaterThan(70);
	});

	it("jede Org-Tabelle hat RLS und mindestens eine Policy", () => {
		const failing = results.filter((r) => !r.ok);
		expect(failing.map((f) => f.table)).toEqual([]);
	});

	it("Ausnahmen sind genau die Better-Auth-Tabellen", () => {
		const exempt = results.filter((r) => AUTH_TABLES_WITHOUT_RLS.has(r.table));
		expect(exempt.map((r) => r.table).sort()).toEqual([
			"invitation",
			"member",
			"sso_provider",
		]);
	});
});
