import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { schema } from "@/db";
import {
	assessmentAnswers,
	assessments,
	frameworks,
	orgFrameworks,
	orgSettings,
	tasks,
} from "@/db/schema";
import type { AssessmentQuestion } from "@/db/schema/enums";
import { loadImplementationPlan } from "@/lib/assessments/plan-server";
import { EDGES_BY_CONTROL } from "@/lib/compliance/catalog";
import { ensureControlImplementations } from "@/lib/compliance/initialize-org";
import { generateDek, wrapDek } from "@/lib/crypto/envelope";
import type { OrgTx } from "@/lib/db/with-org";

// Integrationstest (DATABASE_URL_TEST): Umsetzungsplan aus den Daten der
// Org (Teil C). Spur = verantwortliche Person des Controls, die Richtlinie
// des Bereichs vor der Technik, gespeicherte Einstellungen wirken, und eine
// fremde Org sieht die Gap-Analyse nicht.

vi.mock("next-intl/server", () => ({
	getTranslations: async () => (key: string) => key,
}));

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

// Richtlinie Zugang, starke Anmeldung, Patchmanagement
const CODES = ["CC-IAM-01", "CC-IAM-03", "CC-OPS-03"] as const;
const isoKeys = (code: string) =>
	(EDGES_BY_CONTROL.get(code) ?? [])
		.filter((e) => e.requirement.startsWith("iso27001:"))
		.map((e) => e.requirement);

d("Umsetzungsplan (Postgres)", () => {
	const client = postgres(url ?? "postgres://invalid", { max: 1 });
	const db = drizzle(client, { schema, casing: "snake_case" });
	const stamp = Date.now();
	const org = { a: "", b: "" };
	let bert = "";
	let assessmentId = "";

	const inOrg = <T>(orgId: string, fn: (tx: OrgTx) => Promise<T>) =>
		db.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
			return fn(tx);
		});

	beforeAll(async () => {
		const [u] = await client`
			insert into "user" (name, email, email_verified, created_at, updated_at)
			values ('Bert', ${`plan-bert-${stamp}@example.com`}, true, now(), now())
			returning id`;
		bert = u?.id as string;
		for (const key of ["a", "b"] as const) {
			const [o] = await client`
				insert into organization (name, slug, created_at)
				values (${`Plan ${key}`}, ${`plan-${key}-${stamp}`}, now()) returning id`;
			org[key] = o?.id as string;
			await client`insert into member (organization_id, user_id, role, created_at)
				values (${org[key]}, ${bert}, 'owner', now())`;
			const wrapped = await wrapDek(await generateDek());
			await inOrg(org[key], async (tx) => {
				await tx.insert(orgSettings).values({
					organizationId: org[key],
					encryptedDek: wrapped.wrapped,
					keyVersion: wrapped.keyVersion,
					licenceStage: "1_agent",
				});
				const [fw] = await tx
					.select({ id: frameworks.id })
					.from(frameworks)
					.where(eq(frameworks.slug, "iso27001"));
				if (fw)
					await tx
						.insert(orgFrameworks)
						.values({ organizationId: org[key], frameworkId: fw.id });
			});
		}
		await inOrg(org.a, async (tx) => {
			// ohne Bereich → Funktion: verantwortlich ist Bert
			await ensureControlImplementations(tx, org.a, bert, [...CODES]);
			const questions: AssessmentQuestion[] = CODES.map((code, i) => ({
				code: `Q${i + 1}`,
				sectionCode: "S",
				sectionTitle: "S",
				text: code,
				controlCode: code,
				requirements: isoKeys(code),
				frameworks: ["iso27001"],
				weight: 1,
			}));
			const [a] = await tx
				.insert(assessments)
				.values({
					organizationId: org.a,
					code: "GA-PLAN",
					kind: "self",
					templateCode: "catalog",
					title: "Gap-Analyse",
					questions,
					frameworks: ["iso27001"],
				})
				.returning({ id: assessments.id });
			assessmentId = a?.id as string;
			await tx.insert(assessmentAnswers).values(
				questions.map((q) => ({
					organizationId: org.a,
					assessmentId,
					questionCode: q.code,
					answer: "no" as const,
					answeredByUserId: bert,
				})),
			);
		});
	});

	afterAll(async () => {
		for (const id of Object.values(org))
			if (id) await client`delete from organization where id = ${id}`;
		if (bert) await client`delete from "user" where id = ${bert}`;
		await client.end();
	});

	it("plant aus den Antworten, Spur ist die verantwortliche Person", async () => {
		const plan = await inOrg(org.a, (tx) =>
			loadImplementationPlan(tx, org.a, assessmentId),
		);
		expect(plan).not.toBeNull();
		const items = new Map(
			(plan?.schedule.items ?? []).map((i) => [i.controlCode, i]),
		);
		for (const code of CODES) {
			expect(items.get(code)?.kind, code).toBe("implement");
			expect(plan?.owners.get(code)?.ownerUserId, code).toBe(bert);
			expect(items.get(code)?.lane, code).toBe(`u:${bert}`);
		}
		// Richtlinie vor der Technik im selben Bereich
		const policy = items.get("CC-IAM-01");
		const mfa = items.get("CC-IAM-03");
		expect(mfa?.after).toContain("CC-IAM-01");
		expect(mfa?.startDay).toBeGreaterThanOrEqual(policy?.endDay ?? 0);
		// eine Person: alles nacheinander
		const spans = [...items.values()].sort((x, y) => x.startDay - y.startDay);
		for (let i = 1; i < spans.length; i += 1)
			expect(spans[i]?.startDay).toBeGreaterThanOrEqual(
				spans[i - 1]?.endDay ?? 0,
			);
		expect(plan?.readiness.map((r) => r.slug)).toEqual(["iso27001"]);
	});

	it("nimmt gespeicherte Einstellungen", async () => {
		await inOrg(org.a, (tx) =>
			tx
				.update(assessments)
				.set({
					plan: {
						start: "2027-01-04",
						capacity: 1,
						overrides: { "CC-OPS-03": 7 },
						version: 1,
					},
				})
				.where(eq(assessments.id, assessmentId)),
		);
		const plan = await inOrg(org.a, (tx) =>
			loadImplementationPlan(tx, org.a, assessmentId),
		);
		expect(plan?.schedule.start).toBe("2027-01-04");
		const ops = plan?.schedule.items.find((i) => i.controlCode === "CC-OPS-03");
		expect(ops).toMatchObject({ days: 7, overridden: true });
	});

	it("sieht die Gap-Analyse einer anderen Organisation nicht", async () => {
		const plan = await inOrg(org.b, (tx) =>
			loadImplementationPlan(tx, org.b, assessmentId),
		);
		expect(plan).toBeNull();
	});

	it("speichert Beginn und Ende an der Aufgabe", async () => {
		const [t] = await inOrg(org.a, (tx) =>
			tx
				.insert(tasks)
				.values({
					organizationId: org.a,
					title: "Umsetzen: Plan",
					startAt: "2027-01-04",
					dueAt: "2027-01-22",
					sourceKind: "assessment",
				})
				.returning({ startAt: tasks.startAt, dueAt: tasks.dueAt }),
		);
		expect(t).toEqual({ startAt: "2027-01-04", dueAt: "2027-01-22" });
		const others = await inOrg(org.b, (tx) =>
			tx
				.select({ id: tasks.id })
				.from(tasks)
				.where(
					and(
						eq(tasks.organizationId, org.a),
						eq(tasks.title, "Umsetzen: Plan"),
					),
				),
		);
		expect(others).toEqual([]);
	});
});
