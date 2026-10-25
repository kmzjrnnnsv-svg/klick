import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@/db";
import { approvalWorkflows, orgSettings } from "@/db/schema";
import { ensureOrgWorkflows } from "@/lib/approvals/service";
import {
	LEGACY_DESCRIPTIONS,
	LEGACY_DOCUMENT_PUBLISH_STEPS,
	WORKFLOW_BY_KIND,
} from "@/lib/compliance/catalog/approval-workflows";
import { generateDek, wrapDek } from "@/lib/crypto/envelope";
import { type OrgTx, takeQueuedAudits } from "@/lib/db/with-org";

// Integrationstest (DATABASE_URL_TEST): ein gewähltes Rahmenwerk schaltet
// seine Pflicht-Freigaben einmal ein; bewusst ausgeschaltete bleiben aus;
// im individuellen Modus schaltet sich nichts ein; unveränderte
// Altfassungen bekommen die neuen Stufen und Beschreibungen.

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

d("Freigaben je Rahmenwerk (Postgres)", () => {
	const client = postgres(url ?? "postgres://invalid", { max: 1 });
	const db = drizzle(client, { schema, casing: "snake_case" });
	const stamp = Date.now();
	let orgId = "";

	const inOrg = <T>(fn: (tx: OrgTx) => Promise<T>) =>
		db.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
			return fn(tx);
		});
	const enabledOf = (kind: string) =>
		inOrg(async (tx) => {
			const [r] = await tx
				.select({ enabled: approvalWorkflows.enabled })
				.from(approvalWorkflows)
				.where(
					and(
						eq(approvalWorkflows.organizationId, orgId),
						eq(approvalWorkflows.kind, kind),
					),
				);
			return r?.enabled ?? null;
		});
	const ensure = (frameworks: string[]) =>
		inOrg(async (tx) => {
			const out = await ensureOrgWorkflows(tx, orgId, "2_casp_zag", {
				frameworks,
			});
			return { ...out, audits: takeQueuedAudits(tx) };
		});

	beforeAll(async () => {
		const [o] = await client`
			insert into organization (name, slug, created_at)
			values ('Pflichten', ${`pflichten-${stamp}`}, now()) returning id`;
		orgId = o?.id as string;
		const wrapped = await wrapDek(await generateDek());
		await inOrg(async (tx) => {
			await tx.insert(orgSettings).values({
				organizationId: orgId,
				encryptedDek: wrapped.wrapped,
				keyVersion: wrapped.keyVersion,
				licenceStage: "2_casp_zag",
			});
			// Altbestand: document_publish wie bis Oktober 2026
			await tx.insert(approvalWorkflows).values({
				organizationId: orgId,
				entityType: "document",
				kind: "document_publish",
				name: "Dokument veröffentlichen",
				trigger: "document.publish",
				description: LEGACY_DESCRIPTIONS.document_publish,
				steps: LEGACY_DOCUMENT_PUBLISH_STEPS,
				enabled: true,
			});
		});
	});

	afterAll(async () => {
		if (orgId) await client`delete from organization where id = ${orgId}`;
		await client.end();
	});

	it("ISO 27001 schaltet den Geltungsbereich ein, mit Audit", async () => {
		const out = await ensure(["iso27001"]);
		expect(out.enabled.map((e) => e.kind)).toEqual(["scope"]);
		expect(out.enabled[0]?.basis).toEqual(["ISO 27001 Abschnitt 4.3"]);
		expect(out.audits.map((a) => a.action)).toEqual([
			"approval_workflow.enabled_by_framework",
		]);
		expect(await enabledOf("scope")).toBe(true);
		// ohne DORA bleibt die Dienstleister-Freigabe aus
		expect(await enabledOf("provider_intake")).toBe(false);
	});

	it("Altfassung von document_publish wird angeglichen", async () => {
		const [row] = await inOrg((tx) =>
			tx
				.select()
				.from(approvalWorkflows)
				.where(
					and(
						eq(approvalWorkflows.organizationId, orgId),
						eq(approvalWorkflows.kind, "document_publish"),
					),
				),
		);
		const tpl = WORKFLOW_BY_KIND.get("document_publish");
		expect(row?.steps).toEqual(tpl?.steps);
		expect(row?.description).toBe(tpl?.description);
	});

	it("bewusst ausgeschaltet bleibt aus; neues Rahmenwerk schaltet seine ein", async () => {
		await inOrg((tx) =>
			tx
				.update(approvalWorkflows)
				.set({ enabled: false })
				.where(
					and(
						eq(approvalWorkflows.organizationId, orgId),
						eq(approvalWorkflows.kind, "scope"),
					),
				),
		);
		const again = await ensure(["iso27001"]);
		expect(again.enabled).toEqual([]);
		expect(await enabledOf("scope")).toBe(false);

		const dora = await ensure(["iso27001", "dora"]);
		expect(dora.enabled.map((e) => e.kind).sort()).toEqual([
			"provider_intake",
			"provider_intake_management",
			"provider_onboarding",
		]);
		expect(await enabledOf("scope")).toBe(false);
		const [s] = await inOrg((tx) =>
			tx
				.select({ applied: orgSettings.approvalDuties })
				.from(orgSettings)
				.where(eq(orgSettings.organizationId, orgId)),
		);
		expect(
			Object.keys(s?.applied ?? {})
				.filter((k) => !k.startsWith("_"))
				.sort(),
		).toEqual([
			"provider_intake@dora",
			"provider_intake_management@dora",
			"provider_onboarding@dora",
			"scope@iso27001",
		]);
	});

	it("individueller Modus: nichts schaltet sich ein", async () => {
		await inOrg((tx) =>
			tx
				.update(orgSettings)
				.set({ governanceMode: "individual" })
				.where(eq(orgSettings.organizationId, orgId)),
		);
		const out = await ensure(["iso27001", "dora", "gwg"]);
		expect(out.enabled).toEqual([]);
		expect(await enabledOf("aml_risk_analysis")).toBe(false);
	});
});
