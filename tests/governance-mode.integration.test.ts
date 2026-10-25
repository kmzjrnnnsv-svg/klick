import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@/db";
import { approvalWorkflows, auditLog, orgSettings } from "@/db/schema";
import type { ApprovalStep } from "@/db/schema/grc";
import { setGovernanceModeTx } from "@/lib/approvals/governance-mode";
import { ensureOrgWorkflows } from "@/lib/approvals/service";
import { WORKFLOW_BY_KIND } from "@/lib/compliance/catalog/approval-workflows";
import { governanceChecks } from "@/lib/compliance/governance-checks";
import { generateDek, wrapDek } from "@/lib/crypto/envelope";
import { type OrgTx, takeQueuedAudits } from "@/lib/db/with-org";

// Integrationstest (DATABASE_URL_TEST): Standard oder individuell (ADR-024).
// Wer im Designer schon Stufen gestaltet hat, startet individuell; im
// individuellen Modus melden die Prüfungen fehlende Pflichten; zurück zum
// Standard sichert eigene Fassungen, schaltet Varianten aus und Pflichten an.

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;
const FWS = ["iso27001", "dora"];
const STAGE = "2_casp_zag";

d("Freigabe-Modus (Postgres)", () => {
	const client = postgres(url ?? "postgres://invalid", { max: 1 });
	const db = drizzle(client, { schema, casing: "snake_case" });
	const stamp = Date.now();
	const orgs: string[] = [];

	const inOrg = <T>(orgId: string, fn: (tx: OrgTx) => Promise<T>) =>
		db.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
			return fn(tx);
		});
	const newOrg = async (slug: string) => {
		const [o] = await client`
			insert into organization (name, slug, created_at)
			values ('Modus', ${`${slug}-${stamp}`}, now()) returning id`;
		const orgId = o?.id as string;
		orgs.push(orgId);
		const wrapped = await wrapDek(await generateDek());
		await inOrg(orgId, (tx) =>
			tx.insert(orgSettings).values({
				organizationId: orgId,
				encryptedDek: wrapped.wrapped,
				keyVersion: wrapped.keyVersion,
				licenceStage: STAGE,
			}),
		);
		return orgId;
	};
	const modeOf = (orgId: string) =>
		inOrg(orgId, async (tx) => {
			const [s] = await tx
				.select({ mode: orgSettings.governanceMode })
				.from(orgSettings)
				.where(eq(orgSettings.organizationId, orgId));
			return s?.mode;
		});
	const workflows = (orgId: string) =>
		inOrg(orgId, (tx) =>
			tx
				.select()
				.from(approvalWorkflows)
				.where(eq(approvalWorkflows.organizationId, orgId)),
		);
	const setKind = (
		orgId: string,
		kind: string,
		set: Partial<typeof approvalWorkflows.$inferInsert>,
	) =>
		inOrg(orgId, (tx) =>
			tx
				.update(approvalWorkflows)
				.set(set)
				.where(
					and(
						eq(approvalWorkflows.organizationId, orgId),
						eq(approvalWorkflows.kind, kind),
					),
				),
		);
	const switchTo = (orgId: string, mode: "standard" | "individual") =>
		inOrg(orgId, (tx) =>
			setGovernanceModeTx(tx, orgId, mode, {
				licenceStage: STAGE,
				frameworks: FWS,
			}),
		);
	const findings = async (orgId: string) =>
		governanceChecks({
			frameworks: FWS,
			stage: 2,
			workflows: await workflows(orgId),
		});

	let orgId = "";
	beforeAll(async () => {
		orgId = await newOrg("modus");
		await inOrg(orgId, (tx) =>
			ensureOrgWorkflows(tx, orgId, STAGE, { frameworks: FWS }),
		);
	});

	afterAll(async () => {
		for (const id of orgs)
			await client`delete from organization where id = ${id}`;
		await client.end();
	});

	it("Standard-Aufbau erfüllt jede Pflicht", async () => {
		expect(await modeOf(orgId)).toBe("standard");
		expect(await findings(orgId)).toEqual([]);
	});

	it("Designer-Historie: Org startet individuell, einmalig", async () => {
		const other = await newOrg("historie");
		await inOrg(other, (tx) =>
			tx.insert(auditLog).values({
				id: randomUUID(),
				organizationId: other,
				action: "settings.workflow",
				target: "approval_workflow:x",
				after: { steps: [] },
				hash: "test",
			}),
		);
		const audits = await inOrg(other, async (tx) => {
			await ensureOrgWorkflows(tx, other, STAGE, { frameworks: FWS });
			return takeQueuedAudits(tx);
		});
		expect(await modeOf(other)).toBe("individual");
		expect(audits.map((a) => a.action)).toContain(
			"org.governance_mode_changed",
		);
		// zurück zum Standard bleibt Standard (keine zweite Erkennung)
		await switchTo(other, "standard");
		await inOrg(other, (tx) =>
			ensureOrgWorkflows(tx, other, STAGE, { frameworks: FWS }),
		);
		expect(await modeOf(other)).toBe("standard");
	});

	it("individuell: frei gestaltet, Prüfung meldet fehlende Pflichten", async () => {
		const out = await switchTo(orgId, "individual");
		expect(out.audit[0]?.action).toBe("org.governance_mode_changed");
		expect(await modeOf(orgId)).toBe("individual");

		// Bestellung nur noch durch die ISB statt durch alle der GL
		const isb: ApprovalStep[] = [
			{ order: 1, approverRule: "function:isb_ciso" },
		];
		await setKind(orgId, "role_appointment", { steps: isb });
		await setKind(orgId, "scope", { enabled: false });
		await inOrg(orgId, (tx) =>
			tx.insert(approvalWorkflows).values({
				organizationId: orgId,
				entityType: "provider",
				kind: `custom_${stamp}`,
				name: "Einkauf",
				trigger: "provider.intake",
				custom: true,
				steps: isb,
				enabled: true,
			}),
		);
		const list = await findings(orgId);
		expect(list.map((f) => `${f.kind}:${f.problem}`).sort()).toEqual([
			"role_appointment:missing_approver",
			"scope:off",
		]);
		expect(list.find((f) => f.kind === "scope")?.basis).toEqual([
			"ISO 27001 Abschnitt 4.3",
		]);
	});

	it("zurück zum Standard: eigene Fassung gesichert, Varianten aus, Pflichten an", async () => {
		const out = await switchTo(orgId, "standard");
		expect(out.summary.copied).toEqual(["role_appointment"]);
		expect(out.summary.variantsDisabled).toBe(1);
		expect(out.summary.enabled).toContain("scope");
		expect(await modeOf(orgId)).toBe("standard");

		const rows = await workflows(orgId);
		const role = rows.find((r) => r.kind === "role_appointment");
		expect(role?.steps).toEqual(
			WORKFLOW_BY_KIND.get("role_appointment")?.steps,
		);
		const copy = rows.find(
			(r) => r.name === "Funktion bestellen (eigene Fassung)",
		);
		expect(copy?.custom).toBe(true);
		expect(copy?.enabled).toBe(false);
		expect(copy?.steps).toEqual([
			{ order: 1, approverRule: "function:isb_ciso" },
		]);
		expect(rows.find((r) => r.kind === `custom_${stamp}`)?.enabled).toBe(false);
		expect(await findings(orgId)).toEqual([]);
	});
});
