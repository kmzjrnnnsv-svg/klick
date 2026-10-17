import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@/db";
import {
	decide,
	ensureOrgWorkflows,
	listRequestsForUser,
	requestApproval,
} from "@/lib/approvals/service";

// Integrationstest (DATABASE_URL_TEST): Freigabe „Dokument veröffentlichen“
// mit Eigner:in → Compliance → Geschäftsleitung. Reicht die Eigner:in selbst
// ein, entfällt Stufe 1; ohne Compliance meldet das Einreichen die Lücke.

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

d("Freigabe-Ablauf (Postgres)", () => {
	const client = postgres(url ?? "postgres://invalid", { max: 1 });
	const db = drizzle(client, { schema, casing: "snake_case" });
	const stamp = Date.now();
	let orgId = "";
	const users: Record<"anna" | "ben" | "cara" | "dora", string> = {
		anna: "",
		ben: "",
		cara: "",
		dora: "",
	};
	let docId = "";

	async function inOrg<T>(
		fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
	) {
		return db.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
			return fn(tx);
		});
	}

	beforeAll(async () => {
		const [org] = await client`
			insert into organization (name, slug, created_at)
			values ('Freigabe Test', ${`flow-${stamp}`}, now()) returning id`;
		orgId = org?.id;
		for (const [key, role] of [
			["anna", "owner"],
			["ben", "editor"],
			["cara", "editor"],
			["dora", "editor"],
		] as const) {
			const [u] = await client`
				insert into "user" (name, email, email_verified, created_at, updated_at)
				values (${key}, ${`${key}-${stamp}@example.test`}, true, now(), now()) returning id`;
			users[key] = u?.id;
			await client`insert into member (organization_id, user_id, role, created_at)
				values (${orgId}, ${u?.id}, ${role}, now())`;
		}
		await client.begin(async (tx) => {
			await tx`select set_config('app.org_id', ${orgId}, true)`;
			await tx`insert into org_settings (organization_id, encrypted_dek, sector)
				values (${orgId}, 'test-dek', 'other')`;
			await tx`insert into role_assignments (organization_id, function, user_id)
				values (${orgId}, 'management_body', ${users.anna})`;
		});
		await inOrg(async (tx) => {
			await ensureOrgWorkflows(tx, orgId, "0_vorbereitung");
			const [doc] = await tx
				.insert(schema.documents)
				.values({
					organizationId: orgId,
					docNumber: `RL-${stamp % 1000}`,
					title: "Informationssicherheitsrichtlinie",
					ownerUserId: users.cara,
					authorUserId: users.cara,
				})
				.returning({ id: schema.documents.id });
			docId = doc?.id ?? "";
		});
	});

	afterAll(async () => {
		await client.begin(async (tx) => {
			await tx`select set_config('app.scope', 'platform', true)`;
			await tx`delete from organization where id = ${orgId}`;
			for (const id of Object.values(users))
				await tx`delete from "user" where id = ${id}`;
		});
		await client.end({ timeout: 5 });
	});

	const submit = (asUser: string) =>
		inOrg((tx) =>
			requestApproval(
				tx,
				{ orgId, userId: asUser, name: "Test" },
				{
					kind: "document_publish",
					entityType: "document",
					entityId: docId,
					title: "RL",
					link: "/dokumente/RL",
				},
			),
		);

	it("ohne Compliance-Funktion: Einreichen sagt, welche Stufe fehlt", async () => {
		const r = await submit(users.cara);
		expect(r).toEqual({
			ok: false,
			error: "no_approver",
			missing: { step: 2, rule: "function:compliance" },
		});
	});

	it("Eigner:in reicht ein → Stufe 1 entfällt, Ben (Compliance) sieht „wartet auf dich“, Anna gibt zuletzt frei", async () => {
		await client.begin(async (tx) => {
			await tx`select set_config('app.org_id', ${orgId}, true)`;
			await tx`insert into role_assignments (organization_id, function, user_id)
				values (${orgId}, 'compliance', ${users.ben})`;
		});
		const r = await submit(users.cara);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.status).toBe("pending");
		expect(r.skippedSteps).toEqual([
			{ order: 1, reason: "owner_is_requester" },
		]);
		expect(r.approverIds).toEqual([users.ben]);

		const inbox = await inOrg((tx) =>
			listRequestsForUser(tx, orgId, users.ben),
		);
		expect(inbox.find((x) => x.id === r.requestId)?.eligible).toBe(true);

		// Cara (Antragstellerin) darf nicht, Anna noch nicht (Stufe 3)
		const byAnna = await inOrg((tx) =>
			decide(
				tx,
				{ orgId, userId: users.anna, name: "Anna" },
				{
					requestId: r.requestId,
					decision: "approved",
				},
			),
		);
		expect(byAnna).toEqual({ ok: false, error: "rule_not_met" });

		const byBen = await inOrg((tx) =>
			decide(
				tx,
				{ orgId, userId: users.ben, name: "Ben" },
				{
					requestId: r.requestId,
					decision: "approved",
				},
			),
		);
		expect(byBen.ok && byBen.status).toBe("pending");
		// Ben zählt auf seiner Stufe nicht doppelt — die Anfrage steht schon auf 3
		const again = await inOrg((tx) =>
			decide(
				tx,
				{ orgId, userId: users.ben, name: "Ben" },
				{
					requestId: r.requestId,
					decision: "approved",
				},
			),
		);
		expect(again.ok).toBe(false);

		const final = await inOrg((tx) =>
			decide(
				tx,
				{ orgId, userId: users.anna, name: "Anna" },
				{
					requestId: r.requestId,
					decision: "approved",
				},
			),
		);
		expect(final.ok && final.status).toBe("approved");
	});

	it("andere Person reicht ein → Eigner:in entscheidet Stufe 1 (früher nie möglich)", async () => {
		// Anna ist einzige Leitung und reicht selbst ein → Stufe 3 unbesetzbar
		expect(await submit(users.anna)).toMatchObject({
			ok: false,
			missing: { step: 3 },
		});
		// Ben hält Compliance und reicht ein → Vier-Augen sperrt Stufe 2
		expect(await submit(users.ben)).toMatchObject({
			ok: false,
			missing: { step: 2 },
		});
		const viaDora = await submit(users.dora);
		expect(viaDora.ok).toBe(true);
		if (!viaDora.ok) return;
		expect(viaDora.skippedSteps).toEqual([]);
		expect(viaDora.approverIds).toEqual([users.cara]);
		const byOwner = await inOrg((tx) =>
			decide(
				tx,
				{ orgId, userId: users.cara, name: "Cara" },
				{ requestId: viaDora.requestId, decision: "approved" },
			),
		);
		expect(byOwner.ok && byOwner.status).toBe("pending");
	});
});
