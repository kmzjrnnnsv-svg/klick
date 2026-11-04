import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { schema } from "@/db";
import {
	accessReviewItems,
	controlImplementations,
	controls,
	controlTests,
	identityCheckResults,
	identitySources,
	orgSettings,
	tasks,
} from "@/db/schema";
import { ensureControlImplementations } from "@/lib/compliance/initialize-org";
import { generateDek, wrapDek } from "@/lib/crypto/envelope";
import type { OrgTx } from "@/lib/db/with-org";
import {
	closeAccessReview,
	confirmAllOpen,
	decideAccessReviewItem,
	startAccessReview,
} from "@/lib/identity/review-service";
import { applySnapshot, syncContext } from "@/lib/identity/service";
import type { ProviderAccount } from "@/lib/identity/types";

// Integrationstest (DATABASE_URL_TEST): Zugriffsprüfung (Teil D I2). Start
// übernimmt die Konten, entscheiden darf nur die Prüfer:in (Inhaber:innen
// springen ein), Abschluss erst ohne offene, legt Aufgaben und den Test an
// CC-IAM-05 an und macht „Rezertifizierung“ bestanden.

vi.mock("next-intl/server", () => ({
	getTranslations: async () => (key: string) => key,
}));

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

const acc = (
	id: string,
	over: Partial<ProviderAccount> = {},
): ProviderAccount => ({
	externalId: id,
	email: `${id}@contoso.example`,
	displayName: id,
	kind: "member",
	enabled: true,
	isAdmin: false,
	isTopAdmin: false,
	adminRoles: [],
	mfaRegistered: true,
	lastSignInAt: new Date().toISOString(),
	createdAt: "2025-01-01T00:00:00.000Z",
	leaveAt: null,
	...over,
});

d("Zugriffsprüfung (Postgres)", () => {
	const client = postgres(url ?? "postgres://invalid", { max: 1 });
	const db = drizzle(client, { schema, casing: "snake_case" });
	const stamp = Date.now();
	let org = "";
	let owner = "";
	let editor = "";
	let sourceId = "";
	let reviewId = "";

	const inOrg = <T>(fn: (tx: OrgTx) => Promise<T>) =>
		db.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.org_id', ${org}, true)`);
			return fn(tx);
		});

	beforeAll(async () => {
		const users = await client`
			insert into "user" (name, email, email_verified, created_at, updated_at)
			values ('Olga', ${`o-${stamp}@contoso.example`}, true, now(), now()),
			       ('Emil', ${`e-${stamp}@contoso.example`}, true, now(), now())
			returning id`;
		owner = users[0]?.id as string;
		editor = users[1]?.id as string;
		const [o] = await client`
			insert into organization (name, slug, created_at)
			values ('Review', ${`review-${stamp}`}, now()) returning id`;
		org = o?.id as string;
		await client`insert into member (organization_id, user_id, role, created_at)
			values (${org}, ${owner}, 'owner', now()), (${org}, ${editor}, 'editor', now())`;
		const wrapped = await wrapDek(await generateDek());
		await inOrg(async (tx) => {
			await tx.insert(orgSettings).values({
				organizationId: org,
				encryptedDek: wrapped.wrapped,
				keyVersion: wrapped.keyVersion,
				licenceStage: "1_agent",
			});
			await ensureControlImplementations(tx, org, owner, [
				"CC-IAM-02",
				"CC-IAM-03",
				"CC-IAM-04",
				"CC-IAM-05",
			]);
			const [src] = await tx
				.insert(identitySources)
				.values({
					organizationId: org,
					provider: "entra",
					tenantKey: `tenant-${stamp}`,
					status: "active",
					connectedAt: new Date(),
					createdBy: owner,
				})
				.returning({ id: identitySources.id });
			sourceId = src?.id as string;
			const ctx = await syncContext(tx, org, sourceId);
			if (!ctx) throw new Error("no source");
			await applySnapshot(
				tx,
				{ orgId: org },
				{
					source: ctx.source,
					members: ctx.members,
					now: new Date(),
					snapshot: {
						domains: ["contoso.example"],
						capabilities: {
							signIn: true,
							mfa: true,
							roles: true,
							leaveDate: false,
						},
						accounts: [
							acc("anna", {
								isAdmin: true,
								adminRoles: ["User Administrator"],
							}),
							acc("bob"),
							acc("cem"),
							acc("alt", { enabled: false }),
							acc("gast", { kind: "guest", email: "g@x.example" }),
						],
					},
				},
			);
		});
	});

	afterAll(async () => {
		if (org) await client`delete from organization where id = ${org}`;
		for (const u of [owner, editor])
			if (u) await client`delete from "user" where id = ${u}`;
		await client.end();
	});

	const items = () =>
		inOrg((tx) =>
			tx
				.select({
					id: accessReviewItems.id,
					name: sql<string>`${accessReviewItems.snapshot}->>'name'`,
					decision: accessReviewItems.decision,
					taskId: accessReviewItems.taskId,
				})
				.from(accessReviewItems)
				.where(eq(accessReviewItems.reviewId, reviewId)),
		);

	it("Start übernimmt nur aktive Mitglieder, eine Prüfung zur Zeit", async () => {
		const r = await inOrg((tx) =>
			startAccessReview(
				tx,
				{ orgId: org, userId: owner },
				{
					sourceId,
					title: "Q4",
					dueAt: null,
					scope: "members",
					reviewerUserId: editor,
					now: new Date(),
				},
			),
		);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		reviewId = r.data.id;
		expect(r.data.items).toBe(3);
		const again = await inOrg((tx) =>
			startAccessReview(
				tx,
				{ orgId: org, userId: owner },
				{
					sourceId,
					title: "Q4b",
					dueAt: null,
					scope: "all",
					reviewerUserId: editor,
					now: new Date(),
				},
			),
		);
		expect(again).toEqual({ ok: false, error: "identity_review_open" });
	});

	it("nur die Prüfer:in entscheidet, entziehen braucht eine Notiz", async () => {
		const list = await items();
		const bob = list.find((i) => i.name === "bob");
		const stranger = await inOrg((tx) =>
			decideAccessReviewItem(
				tx,
				{ orgId: org, userId: owner, isOwner: false },
				{
					itemId: bob?.id as string,
					decision: "confirm",
					note: null,
					now: new Date(),
				},
			),
		);
		expect(stranger).toEqual({ ok: false, error: "forbidden" });
		const noNote = await inOrg((tx) =>
			decideAccessReviewItem(
				tx,
				{ orgId: org, userId: editor, isOwner: false },
				{
					itemId: bob?.id as string,
					decision: "revoke",
					note: null,
					now: new Date(),
				},
			),
		);
		expect(noNote).toEqual({ ok: false, error: "identity_note_required" });
		const ok = await inOrg((tx) =>
			decideAccessReviewItem(
				tx,
				{ orgId: org, userId: editor, isOwner: false },
				{
					itemId: bob?.id as string,
					decision: "revoke",
					note: "Projekt beendet",
					now: new Date(),
				},
			),
		);
		expect(ok.ok).toBe(true);
	});

	it("Abschluss erst ohne offene; danach Aufgabe, Test und Rezertifizierung bestanden", async () => {
		const early = await inOrg((tx) =>
			closeAccessReview(
				tx,
				{ orgId: org, userId: owner },
				{ reviewId, now: new Date() },
			),
		);
		expect(early).toEqual({ ok: false, error: "identity_review_incomplete" });
		const confirmed = await inOrg((tx) =>
			confirmAllOpen(
				tx,
				{ orgId: org, userId: editor, isOwner: false },
				{ reviewId, now: new Date() },
			),
		);
		expect(confirmed).toMatchObject({ ok: true, data: { count: 2 } });
		const done = await inOrg((tx) =>
			closeAccessReview(
				tx,
				{ orgId: org, userId: owner },
				{ reviewId, now: new Date() },
			),
		);
		expect(done).toMatchObject({ ok: true, data: { tasks: 1 } });
		const list = await items();
		const bob = list.find((i) => i.name === "bob");
		expect(bob?.taskId).not.toBeNull();
		const [task] = await inOrg((tx) =>
			tx
				.select({
					assignee: tasks.assigneeUserId,
					source: tasks.sourceKind,
					title: tasks.title,
				})
				.from(tasks)
				.where(eq(tasks.id, bob?.taskId as string)),
		);
		expect(task).toMatchObject({ assignee: editor, source: "access_review" });
		expect(task?.title).toContain("Zugang entziehen");
		const tests = await inOrg((tx) =>
			tx
				.select({ code: controls.code, result: controlTests.result })
				.from(controlTests)
				.innerJoin(
					controlImplementations,
					eq(controlImplementations.id, controlTests.implementationId),
				)
				.innerJoin(controls, eq(controls.id, controlImplementations.controlId))
				.where(
					and(
						eq(controlTests.organizationId, org),
						eq(controlTests.method, "access_review"),
					),
				),
		);
		expect(tests).toEqual([{ code: "CC-IAM-05", result: "partial" }]);
		const [recert] = await inOrg((tx) =>
			tx
				.select({ result: identityCheckResults.result })
				.from(identityCheckResults)
				.where(
					and(
						eq(identityCheckResults.organizationId, org),
						eq(identityCheckResults.checkKey, "recert"),
					),
				),
		);
		expect(recert?.result).toBe("pass");
	});

	it("abgeschlossen ist fest", async () => {
		const list = await items();
		const r = await inOrg((tx) =>
			decideAccessReviewItem(
				tx,
				{ orgId: org, userId: owner, isOwner: true },
				{
					itemId: list[0]?.id as string,
					decision: "confirm",
					note: null,
					now: new Date(),
				},
			),
		);
		expect(r).toEqual({ ok: false, error: "identity_review_closed" });
	});
});
