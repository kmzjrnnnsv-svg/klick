import { db } from "@wallet/db";
import { user } from "@wallet/db/auth-schema";
import { members, orgSettings, orgs } from "@wallet/db/schema";
import { verifyAuditChain } from "@wallet/lib/audit";
import { loadOrgDek } from "@wallet/lib/crypto/org-dek";
import { readOrg, withPlatform, withUser } from "@wallet/lib/db/with-org";
import { createOrg } from "@wallet/lib/orgs/service";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

// Org anlegen über den Dienst (Plattform, Org-DEK, Inhaber:in, Audit-Kette)
const d = process.env.WALLET_DATABASE_URL_TEST ? describe : describe.skip;

d("Org anlegen (both.money)", () => {
	const stamp = Date.now();
	let orgId = "";
	let userId = "";

	afterAll(async () => {
		if (orgId)
			await withPlatform({ userId: null, reason: "Test aufräumen" }, (tx) =>
				tx.delete(orgs).where(eq(orgs.id, orgId)),
			);
		if (userId) await db.delete(user).where(eq(user.id, userId));
	});

	it("legt Org, Einstellungen, Inhaber:in und Audit an", async () => {
		const [u] = await db
			.insert(user)
			.values({ name: "Owner", email: `owner-${stamp}@example.org` })
			.returning({ id: user.id });
		userId = u?.id ?? "";
		const created = await createOrg(
			{ userId: null, reason: "Test: Org anlegen" },
			{
				name: "Test GmbH",
				slug: `test-${stamp}`,
				isOperator: true,
				owner: { userId },
			},
		);
		orgId = created.id;

		const mine = await withUser(userId, (tx) =>
			tx
				.select({ org: members.organizationId, role: members.role })
				.from(members),
		);
		expect(mine).toEqual([{ org: orgId, role: "owner" }]);

		await readOrg({ orgId, userId }, async (tx) => {
			const [s] = await tx.select().from(orgSettings);
			expect(s?.custodyMode).toBe("own");
			expect(s?.isOperator).toBe(true);
			const { dek } = await loadOrgDek(tx, orgId);
			expect(dek.length).toBe(32);
			const chain = await verifyAuditChain(tx, orgId);
			expect(chain).toEqual({ ok: true, checked: 1 });
		});
	});

	it("Kurzname wird geprüft", async () => {
		await expect(
			createOrg(
				{ userId: null, reason: "Test" },
				{ name: "X", slug: "approve" },
			),
		).rejects.toThrow(/reserviert/);
	});
});
