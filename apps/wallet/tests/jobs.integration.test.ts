import { db } from "@wallet/db";
import { user } from "@wallet/db/auth-schema";
import { invitations, members, notifications, orgs } from "@wallet/db/schema";
import { readOrg, withOrg, withPlatform } from "@wallet/lib/db/with-org";
import { runVerifyAuditChains } from "@wallet/lib/jobs/audit-chain";
import { runImmediateMails } from "@wallet/lib/jobs/mails";
import { runRetention } from "@wallet/lib/jobs/retention";
import { notify } from "@wallet/lib/notifications/notify";
import { createOrg } from "@wallet/lib/orgs/service";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

const d = process.env.WALLET_DATABASE_URL_TEST ? describe : describe.skip;
const DAY = 86_400_000;

d("Jobs both.money", () => {
	const stamp = Date.now();
	let orgId = "";
	const ids: string[] = [];

	afterAll(async () => {
		if (orgId)
			await withPlatform({ userId: null, reason: "Test aufräumen" }, (tx) =>
				tx.delete(orgs).where(eq(orgs.id, orgId)),
			);
		for (const id of ids) await db.delete(user).where(eq(user.id, id));
	});

	it("Benachrichtigung, Sofort-Mail, Löschfristen, Kette", async () => {
		const made = await db
			.insert(user)
			.values([
				{ name: "A", email: `job-a-${stamp}@example.org` },
				{ name: "B", email: `job-b-${stamp}@example.org` },
			])
			.returning({ id: user.id });
		const [a, b] = made.map((u) => u.id) as [string, string];
		ids.push(a, b);
		orgId = (
			await createOrg(
				{ userId: null, reason: "Test: Jobs" },
				{ name: "Jobs GmbH", slug: `jobs-${stamp}`, owner: { userId: a } },
			)
		).id;
		await withPlatform({ userId: null, reason: "Test: Mitglied" }, (tx) =>
			tx
				.insert(members)
				.values({ organizationId: orgId, userId: b, role: "viewer" }),
		);

		// nie an die handelnde Person
		const n = await withOrg({ orgId, userId: a }, (tx) =>
			notify(tx, {
				orgId,
				actorUserId: a,
				kind: "security_alert",
				title: "Test-Alarm",
				body: "Nur für B",
			}),
		);
		expect(n).toBe(1);
		expect(await runImmediateMails()).toBeGreaterThanOrEqual(1);

		await withOrg({ orgId, userId: null }, async (tx) => {
			const rows = await tx.select().from(notifications);
			expect(rows.map((r) => [r.userId, Boolean(r.emailedAt)])).toEqual([
				[b, true],
			]);
			await tx.insert(notifications).values({
				organizationId: orgId,
				userId: b,
				kind: "member",
				title: "Alt",
				readAt: new Date(Date.now() - 100 * DAY),
			});
			await tx.insert(invitations).values({
				organizationId: orgId,
				email: `alt-${stamp}@example.org`,
				role: "viewer",
				expiresAt: new Date(Date.now() - DAY),
			});
		});

		await runRetention();
		await readOrg({ orgId, userId: null }, async (tx) => {
			const titles = (await tx.select().from(notifications)).map(
				(r) => r.title,
			);
			expect(titles).toEqual(["Test-Alarm"]);
			const [inv] = await tx.select().from(invitations);
			expect(inv?.status).toBe("expired");
		});

		const chains = await runVerifyAuditChains();
		expect(chains.broken).not.toContain(orgId);
		expect(chains.checked).toBeGreaterThanOrEqual(2);
	});
});
