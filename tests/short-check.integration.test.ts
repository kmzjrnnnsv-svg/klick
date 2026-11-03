import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@/db";
import {
	assessments,
	frameworks,
	orgFrameworks,
	orgSettings,
} from "@/db/schema";
import {
	extendSelfAssessment,
	insertSelfAssessment,
} from "@/lib/assessments/create-service";
import { SHORT_CHECK_SIZE } from "@/lib/assessments/short-check";
import { generateDek, wrapDek } from "@/lib/crypto/envelope";
import type { OrgTx } from "@/lib/db/with-org";

// Integrationstest (DATABASE_URL_TEST): Gap-Analyse als Kurz-Check mit den
// wichtigsten Fragen anlegen und später auf alle erweitern; vorhandene
// Fragen bleiben, eine zweite Erweiterung fügt nichts hinzu.

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

d("Kurz-Check der Gap-Analyse (Postgres)", () => {
	const client = postgres(url ?? "postgres://invalid", { max: 1 });
	const db = drizzle(client, { schema, casing: "snake_case" });
	const stamp = Date.now();
	let orgId = "";
	let userId = "";

	const inOrg = <T>(fn: (tx: OrgTx) => Promise<T>) =>
		db.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
			return fn(tx);
		});

	beforeAll(async () => {
		const [u] = await client`
			insert into "user" (name, email, email_verified, created_at, updated_at)
			values ('Kurz', ${`short-${stamp}@example.com`}, true, now(), now())
			returning id`;
		userId = u?.id as string;
		const [o] = await client`
			insert into organization (name, slug, created_at)
			values ('Kurz-Check', ${`short-${stamp}`}, now()) returning id`;
		orgId = o?.id as string;
		const wrapped = await wrapDek(await generateDek());
		await inOrg(async (tx) => {
			await tx.insert(orgSettings).values({
				organizationId: orgId,
				encryptedDek: wrapped.wrapped,
				keyVersion: wrapped.keyVersion,
				licenceStage: "1_agent",
			});
			const fws = await tx
				.select({ id: frameworks.id, slug: frameworks.slug })
				.from(frameworks);
			for (const f of fws.filter((x) => ["iso27001", "nis2"].includes(x.slug)))
				await tx
					.insert(orgFrameworks)
					.values({ organizationId: orgId, frameworkId: f.id });
		});
	});

	afterAll(async () => {
		if (orgId) await client`delete from organization where id = ${orgId}`;
		if (userId) await client`delete from "user" where id = ${userId}`;
		await client.end();
	});

	it("legt die wichtigsten Fragen an und erweitert auf alle", async () => {
		const ctx = { orgId, userId };
		const short = await inOrg((tx) =>
			insertSelfAssessment(tx, ctx, { scope: "short" }),
		);
		const all = await inOrg((tx) =>
			insertSelfAssessment(tx, ctx, { scope: "all" }),
		);
		expect(short?.questions).toBe(SHORT_CHECK_SIZE);
		expect(all && all.questions > SHORT_CHECK_SIZE).toBe(true);
		// Kurz-Check ist eine Teilmenge des ganzen Fragebogens
		for (const code of short?.questionCodes ?? [])
			expect(all?.questionCodes).toContain(code);

		const row = async () => {
			const [a] = await inOrg((tx) =>
				tx
					.select()
					.from(assessments)
					.where(eq(assessments.id, short?.id as string)),
			);
			if (!a) throw new Error("fehlt");
			return a;
		};
		const before = await row();
		const first = await inOrg((tx) => extendSelfAssessment(tx, orgId, before));
		expect(first?.added).toBe((all?.questions ?? 0) - SHORT_CHECK_SIZE);
		expect(first?.audit[0]?.action).toBe("assessment.extended");
		const after = await row();
		expect(after.questions.map((q) => q.code)).toEqual(all?.questionCodes);

		const second = await inOrg((tx) => extendSelfAssessment(tx, orgId, after));
		expect(second?.added).toBe(0);
		expect(second?.audit).toEqual([]);
	});
});
