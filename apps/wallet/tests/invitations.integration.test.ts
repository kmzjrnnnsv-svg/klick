import { db } from "@wallet/db";
import { session, user } from "@wallet/db/auth-schema";
import { invitations, members, orgs } from "@wallet/db/schema";
import { resolveLink } from "@wallet/lib/auth/links";
import { readOrg, withPlatform } from "@wallet/lib/db/with-org";
import {
	acceptInvitation,
	createInvitation,
} from "@wallet/lib/orgs/invitations";
import { createOrg } from "@wallet/lib/orgs/service";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

// Einladen → Link prüfen → annehmen (richtige/falsche Adresse, zweimal)
const d = process.env.WALLET_DATABASE_URL_TEST ? describe : describe.skip;

d("Einladungen (both.money)", () => {
	const stamp = Date.now();
	const email = `einladung-${stamp}@example.org`;
	let orgId = "";
	const users: string[] = [];

	afterAll(async () => {
		if (orgId)
			await withPlatform({ userId: null, reason: "Test aufräumen" }, (tx) =>
				tx.delete(orgs).where(eq(orgs.id, orgId)),
			);
		for (const id of users) await db.delete(user).where(eq(user.id, id));
	});

	async function account(mail: string) {
		const [u] = await db
			.insert(user)
			.values({ name: mail, email: mail })
			.returning({ id: user.id });
		const [s] = await db
			.insert(session)
			.values({
				userId: u?.id as string,
				token: `t-${mail}`,
				expiresAt: new Date(Date.now() + 3_600_000),
				mfaVerifiedAt: new Date(),
			})
			.returning({ id: session.id });
		users.push(u?.id as string);
		return { userId: u?.id as string, sessionId: s?.id as string };
	}

	it("nur die eingeladene Adresse, nur einmal", async () => {
		orgId = (
			await createOrg(
				{ userId: null, reason: "Test: Einladung" },
				{ name: "Einladung GmbH", slug: `einladung-${stamp}` },
			)
		).id;
		const inv = await createInvitation(
			{ orgId, userId: null },
			{ email: email.toUpperCase(), role: "operator" },
		);
		const token = inv.url.split("#")[1] as string;
		expect(token.startsWith("kwl_invite_")).toBe(true);
		const r = await resolveLink(token);
		expect(r.ok && r.info.kind === "invite" && r.info.role).toBe("operator");

		const other = await account(`fremd-${stamp}@example.org`);
		const wrong = await acceptInvitation(
			{ ...other, email: `fremd-${stamp}@example.org`, verifiedAt: null },
			{ organizationId: orgId, invitationId: inv.invitationId },
		);
		expect(wrong).toEqual({ ok: false, error: "wrong_account" });

		const right = await account(email);
		const ok = await acceptInvitation(
			{ ...right, email, verifiedAt: new Date() },
			{ organizationId: orgId, invitationId: inv.invitationId },
		);
		expect(ok).toEqual({ ok: true, orgId });
		const [s] = await db
			.select()
			.from(session)
			.where(eq(session.id, right.sessionId));
		expect([s?.activeOrgId, s?.unlockOrgId]).toEqual([orgId, orgId]);

		const again = await acceptInvitation(
			{ ...right, email, verifiedAt: null },
			{ organizationId: orgId, invitationId: inv.invitationId },
		);
		expect(again).toEqual({ ok: false, error: "invalid" });
		expect((await resolveLink(token)).ok).toBe(false);

		await readOrg({ orgId, userId: null }, async (tx) => {
			const m = await tx.select({ role: members.role }).from(members);
			expect(m).toEqual([{ role: "operator" }]);
			const [i] = await tx.select().from(invitations);
			expect(i?.status).toBe("accepted");
		});
	});
});
