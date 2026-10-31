import { and, count, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@/db";
import {
	controlImplementations,
	controls,
	customFrameworks,
	customRequirementControls,
	customRequirements,
	orgSettings,
} from "@/db/schema";
import { EDGES, FRAMEWORK_BY_SLUG } from "@/lib/compliance/catalog";
import { excludeRequirements } from "@/lib/compliance/exclusion-service";
import { loadOrgCatalog } from "@/lib/compliance/org-catalog-server";
import { orgCoverage } from "@/lib/compliance/queries";
import { generateDek, wrapDek } from "@/lib/crypto/envelope";
import {
	CustomFrameworkError,
	copyCatalogFramework,
	createCustomFramework,
	deleteCustomFramework,
	saveRequirement,
	setFrameworkStatus,
	setRequirementExclusion,
} from "@/lib/custom-frameworks/service";
import type { OrgTx } from "@/lib/db/with-org";

// Integrationstest (DATABASE_URL_TEST): eigene Rahmenwerke (R4). Anlegen,
// Anforderung zuordnen, einschalten → zählt in orgCoverage und legt die
// Umsetzung der Maßnahme an; Ausschluss nur, wenn erlaubt; Kopie von
// ISO 27001 mit allen Anforderungen und Kanten; zurückgezogen zählt nicht;
// fremde Org sieht nichts (RLS).

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

d("Eigene Rahmenwerke (Postgres)", () => {
	const client = postgres(url ?? "postgres://invalid", { max: 1 });
	const db = drizzle(client, { schema, casing: "snake_case" });
	const stamp = Date.now();
	const org: Record<"A" | "B", string> = { A: "", B: "" };
	let userId = "";
	let fwId = "";
	let fwKey = "";

	const inOrg = <T>(orgId: string, fn: (tx: OrgTx) => Promise<T>) =>
		db.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
			return fn(tx);
		});
	const ctxA = () => ({ orgId: org.A, userId });

	beforeAll(async () => {
		const [u] = await client`
			insert into "user" (name, email, email_verified, created_at, updated_at)
			values ('Eigene', ${`custom-${stamp}@example.com`}, true, now(), now())
			returning id`;
		userId = u?.id as string;
		for (const name of ["A", "B"] as const) {
			const [o] = await client`
				insert into organization (name, slug, created_at)
				values (${`Custom ${name}`}, ${`custom-${name.toLowerCase()}-${stamp}`}, now())
				returning id`;
			org[name] = o?.id as string;
			const wrapped = await wrapDek(await generateDek());
			await inOrg(org[name], (tx) =>
				tx.insert(orgSettings).values({
					organizationId: org[name],
					encryptedDek: wrapped.wrapped,
					keyVersion: wrapped.keyVersion,
				}),
			);
		}
	});

	afterAll(async () => {
		for (const id of Object.values(org))
			if (id) await client`delete from organization where id = ${id}`;
		if (userId) await client`delete from "user" where id = ${userId}`;
		await client.end();
	});

	it("anlegen, zuordnen, einschalten: zählt in der Abdeckung", async () => {
		const created = await inOrg(org.A, (tx) =>
			createCustomFramework(tx, ctxA(), {
				name: "Anforderungen der Kunde A GmbH",
				origin: "customer",
				exclusionAllowed: false,
			}),
		);
		fwId = created.id;
		fwKey = created.key;
		expect(fwKey).toBe("anforderungen-der-kunde-a-gmbh");
		await inOrg(org.A, (tx) =>
			saveRequirement(tx, ctxA(), {
				frameworkId: fwId,
				sectionCode: "A",
				code: "A.1",
				title: "Rechte prüfen",
				text: "Zugriffsrechte werden vierteljährlich geprüft.",
				domain: "access",
				controls: [{ code: "CC-IAM-05", coverage: "full" }],
			}),
		);
		// Entwurf zählt nicht
		const draft = await inOrg(org.A, (tx) => orgCoverage(tx, org.A));
		expect(draft?.frameworks).not.toContain(`x-${fwKey}`);

		await inOrg(org.A, (tx) => setFrameworkStatus(tx, ctxA(), fwId, "active"));
		const cov = await inOrg(org.A, (tx) => orgCoverage(tx, org.A));
		const slug = `x-${fwKey}`;
		expect(cov?.frameworks).toContain(slug);
		expect(cov?.result.byRequirement.get(`${slug}:A.1`)).toBe("open");
		expect(cov?.result.byFramework.get(slug)?.applicable).toBe(1);

		// Einschalten hat die Umsetzung der Maßnahme angelegt
		const [impl] = await inOrg(org.A, (tx) =>
			tx
				.select({ status: controlImplementations.status })
				.from(controlImplementations)
				.innerJoin(controls, eq(controls.id, controlImplementations.controlId))
				.where(
					and(
						eq(controlImplementations.organizationId, org.A),
						eq(controls.code, "CC-IAM-05"),
					),
				),
		);
		expect(impl?.status).toBe("not_started");

		// Maßnahme umgesetzt → Anforderung erfüllt
		await inOrg(org.A, async (tx) => {
			const [c] = await tx
				.select({ id: controls.id })
				.from(controls)
				.where(eq(controls.code, "CC-IAM-05"));
			await tx
				.update(controlImplementations)
				.set({ status: "implemented" })
				.where(
					and(
						eq(controlImplementations.organizationId, org.A),
						eq(controlImplementations.controlId, c?.id as string),
					),
				);
		});
		const done = await inOrg(org.A, (tx) => orgCoverage(tx, org.A));
		expect(done?.result.byRequirement.get(`${slug}:A.1`)).toBe("covered");
	});

	it("Ausschluss nur, wenn das Rahmenwerk ihn erlaubt", async () => {
		const reqId = await inOrg(org.A, async (tx) => {
			const [r] = await tx
				.select({ id: customRequirements.id })
				.from(customRequirements)
				.where(eq(customRequirements.frameworkId, fwId));
			return r?.id as string;
		});
		await expect(
			inOrg(org.A, (tx) =>
				setRequirementExclusion(tx, ctxA(), reqId, true, "Kein Fernzugriff"),
			),
		).rejects.toBeInstanceOf(CustomFrameworkError);
		// über den gemeinsamen Dienst (Gap-Analyse, Control-Status) ebenso nicht
		const none = await inOrg(org.A, async (tx) =>
			excludeRequirements(
				tx,
				org.A,
				[{ key: `x-${fwKey}:A.1`, note: "Kein Fernzugriff" }],
				"test",
				await loadOrgCatalog(tx, org.A),
			),
		);
		expect(none).toEqual([]);
		await inOrg(org.A, (tx) =>
			tx
				.update(customFrameworks)
				.set({ exclusionAllowed: true })
				.where(eq(customFrameworks.id, fwId)),
		);
		const audits = await inOrg(org.A, async (tx) =>
			excludeRequirements(
				tx,
				org.A,
				[{ key: `x-${fwKey}:A.1`, note: "Kein Fernzugriff" }],
				"test",
				await loadOrgCatalog(tx, org.A),
			),
		);
		expect(audits.map((a) => a.action)).toEqual([
			"custom_framework.requirement_excluded",
		]);
		const cov = await inOrg(org.A, (tx) => orgCoverage(tx, org.A));
		expect(cov?.result.byRequirement.get(`x-${fwKey}:A.1`)).toBe(
			"not_applicable",
		);
		expect(cov?.applicabilityDetail.get(`x-${fwKey}:A.1`)?.note).toBe(
			"Kein Fernzugriff",
		);
	});

	it("Kopie von ISO 27001 mit allen Anforderungen und Kanten", async () => {
		const iso = FRAMEWORK_BY_SLUG.get("iso27001");
		const isoEdges = EDGES.filter((e) =>
			e.requirement.startsWith("iso27001:"),
		).length;
		const copy = await inOrg(org.A, (tx) =>
			copyCatalogFramework(tx, ctxA(), { slug: "iso27001" }),
		);
		const [reqs] = await inOrg(org.A, (tx) =>
			tx
				.select({ n: count() })
				.from(customRequirements)
				.where(eq(customRequirements.frameworkId, copy.id)),
		);
		const [edges] = await inOrg(org.A, (tx) =>
			tx
				.select({ n: count() })
				.from(customRequirementControls)
				.innerJoin(
					customRequirements,
					eq(customRequirements.id, customRequirementControls.requirementId),
				)
				.where(eq(customRequirements.frameworkId, copy.id)),
		);
		expect(reqs?.n).toBe(iso?.requirements.length);
		expect(edges?.n).toBe(isoEdges);
		const catalog = await inOrg(org.A, (tx) => loadOrgCatalog(tx, org.A));
		expect(catalog.custom.get(`x-${copy.key}`)?.copiedFrom).toBe("iso27001");
	});

	it("fremde Org sieht nichts (RLS)", async () => {
		const rows = await inOrg(org.B, (tx) =>
			tx.select({ id: customFrameworks.id }).from(customFrameworks),
		);
		expect(rows).toEqual([]);
		const reqs = await inOrg(org.B, (tx) =>
			tx.select({ id: customRequirements.id }).from(customRequirements),
		);
		expect(reqs).toEqual([]);
		const cov = await inOrg(org.B, (tx) => orgCoverage(tx, org.B));
		expect(cov?.frameworks.some((s) => s.startsWith("x-"))).toBe(false);
	});

	it("zurückgezogen zählt nicht mehr; aktiv lässt sich nicht löschen", async () => {
		await expect(
			inOrg(org.A, (tx) => deleteCustomFramework(tx, ctxA(), fwId)),
		).rejects.toBeInstanceOf(CustomFrameworkError);
		await inOrg(org.A, (tx) => setFrameworkStatus(tx, ctxA(), fwId, "retired"));
		const cov = await inOrg(org.A, (tx) => orgCoverage(tx, org.A));
		expect(cov?.frameworks).not.toContain(`x-${fwKey}`);
		await inOrg(org.A, (tx) => deleteCustomFramework(tx, ctxA(), fwId));
	});
});
