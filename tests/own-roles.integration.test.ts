import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { schema } from "@/db";
import {
	approvalRequests,
	memberRoles,
	orgRoles,
	orgSettings,
	risks,
	roleAssignments,
} from "@/db/schema";
import { applyApprovalOutcome } from "@/lib/approvals/outcomes";
import { decide } from "@/lib/approvals/service";
import { proposeAssignment } from "@/lib/compliance/appointment-service";
import { ownRoleKey } from "@/lib/compliance/function-key";
import { syncFunctionOwners } from "@/lib/compliance/function-owners";
import { generateDek, wrapDek } from "@/lib/crypto/envelope";
import type { OrgTx } from "@/lib/db/with-org";
import { syncMemberRoles } from "@/lib/org/member-role-sync";
import {
	dropInvitedOwnRoles,
	setOwnRoleAssignments,
} from "@/lib/org/own-role-service";

// Integrationstest (DATABASE_URL_TEST): eigene Rollen als Funktion
// (ADR-024). Wer eine Rolle trägt, bestellt die Geschäftsleitung; erst dann
// gelten die Rechte (member_roles). Abberufung nimmt sie wieder; Externe
// bekommen nie Rechte; eine eigene Rolle kann verantwortlich sein.

vi.mock("next-intl/server", () => ({
	getTranslations: async () => (key: string) => key,
}));

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

d("Eigene Rollen als Funktion (Postgres)", () => {
	const client = postgres(url ?? "postgres://invalid", { max: 1 });
	const db = drizzle(client, { schema, casing: "snake_case" });
	const stamp = Date.now();
	let orgId = "";
	let roleId = "";
	const u = { anna: "", bert: "", erik: "", pia: "" };
	const actor = (who: keyof typeof u) => ({ orgId, userId: u[who], name: who });

	const inOrg = <T>(fn: (tx: OrgTx) => Promise<T>) =>
		db.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
			return fn(tx);
		});
	const rights = () =>
		inOrg((tx) =>
			tx
				.select({ userId: memberRoles.userId, email: memberRoles.pendingEmail })
				.from(memberRoles)
				.where(eq(memberRoles.organizationId, orgId)),
		);
	const pending = (entityId: string) =>
		inOrg(async (tx) => {
			const [r] = await tx
				.select({ id: approvalRequests.id })
				.from(approvalRequests)
				.where(
					and(
						eq(approvalRequests.entityId, entityId),
						eq(approvalRequests.status, "pending"),
					),
				);
			return r?.id ?? null;
		});
	const approveAs = (who: keyof typeof u, requestId: string) =>
		inOrg(async (tx) => {
			const r = await decide(tx, actor(who), {
				requestId,
				decision: "approved",
			});
			if (r.ok && r.status !== "pending")
				await applyApprovalOutcome(tx, { orgId, userId: u[who] }, r);
			return r;
		});
	const holderRow = (userId: string) =>
		inOrg(async (tx) => {
			const [r] = await tx
				.select({ id: roleAssignments.id, status: roleAssignments.status })
				.from(roleAssignments)
				.where(
					and(
						eq(roleAssignments.organizationId, orgId),
						eq(roleAssignments.orgRoleId, roleId),
						eq(roleAssignments.userId, userId),
					),
				);
			return r ?? null;
		});
	const setHolders = (userIds: string[]) =>
		inOrg((tx) =>
			setOwnRoleAssignments(
				tx,
				actor("anna"),
				userIds.map((id) => ({ roleId, holder: { userId: id } })),
				{ roleIds: [roleId] },
				"test",
			),
		);

	beforeAll(async () => {
		for (const name of Object.keys(u) as (keyof typeof u)[]) {
			const [row] = await client`
				insert into "user" (name, email, email_verified, created_at, updated_at)
				values (${name}, ${`${name}-${stamp}@example.com`}, true, now(), now())
				returning id`;
			u[name] = row?.id as string;
		}
		const [o] = await client`
			insert into organization (name, slug, created_at)
			values ('Eigene Rollen', ${`eigene-rollen-${stamp}`}, now()) returning id`;
		orgId = o?.id as string;
		const roles = {
			anna: "owner",
			bert: "owner",
			erik: "editor",
			pia: "auditor",
		};
		for (const [name, role] of Object.entries(roles))
			await client`insert into member (organization_id, user_id, role, created_at)
				values (${orgId}, ${u[name as keyof typeof u]}, ${role}, now())`;
		const wrapped = await wrapDek(await generateDek());
		await inOrg(async (tx) => {
			await tx.insert(orgSettings).values({
				organizationId: orgId,
				encryptedDek: wrapped.wrapped,
				keyVersion: wrapped.keyVersion,
				licenceStage: "0_vorbereitung",
				governanceMode: "individual",
			});
			const [r] = await tx
				.insert(orgRoles)
				.values({
					organizationId: orgId,
					name: "Einkauf",
					permissions: { provider: ["create"] },
				})
				.returning({ id: orgRoles.id });
			roleId = r?.id as string;
			// Geschäftsleitung: Anna (direkt), dann Bert (Anna bestellt allein)
			for (const who of ["anna", "bert"] as const)
				await proposeAssignment(
					tx,
					actor("anna"),
					{ function: "management_body", userId: u[who] },
					"test",
				);
		});
	});

	afterAll(async () => {
		if (orgId) await client`delete from organization where id = ${orgId}`;
		for (const id of Object.values(u))
			await client`delete from "user" where id = ${id}`;
		await client.end();
	});

	it("Vorschlag gibt noch keine Rechte; mit der Bestellung schon", async () => {
		const out = await setHolders([u.erik]);
		expect(out.waiting).toBe(1);
		const row = await holderRow(u.erik);
		expect(row?.status).toBe("proposed");
		expect(await rights()).toEqual([]);
		// Anna hat vorgeschlagen und zählt als erste Zustimmung; Bert fehlt
		const req = (await pending(row?.id as string)) as string;
		expect((await approveAs("bert", req)).ok).toBe(true);
		expect((await holderRow(u.erik))?.status).toBe("appointed");
		expect(await rights()).toEqual([{ userId: u.erik, email: null }]);
	});

	it("eigene Rolle als Verantwortlich folgt der Bestellung", async () => {
		const id = await inOrg(async (tx) => {
			const [r] = await tx
				.insert(risks)
				.values({
					organizationId: orgId,
					code: `R-${stamp}`,
					title: "Lieferant fällt aus",
					ownerFunction: ownRoleKey(roleId),
					ownerUserId: u.anna,
				})
				.returning({ id: risks.id });
			await syncFunctionOwners(tx, orgId);
			return r?.id as string;
		});
		const [r] = await inOrg((tx) =>
			tx
				.select({ owner: risks.ownerUserId })
				.from(risks)
				.where(eq(risks.id, id)),
		);
		expect(r?.owner).toBe(u.erik);
	});

	it("Externe tragen keine Rechte, auch wenn bestellt", async () => {
		await inOrg(async (tx) => {
			await tx.insert(roleAssignments).values({
				organizationId: orgId,
				function: "other",
				orgRoleId: roleId,
				userId: u.pia,
				status: "appointed",
			});
			await syncMemberRoles(tx, orgId, null);
		});
		expect((await rights()).map((r) => r.userId)).toEqual([u.erik]);
	});

	it("Abberufung über die GL nimmt die Rechte", async () => {
		const out = await setHolders([u.pia]);
		expect(out.waiting).toBe(1);
		const row = await holderRow(u.erik);
		expect(row?.status).toBe("revocation_requested");
		// bis zur Entscheidung gelten die Rechte weiter
		expect((await rights()).map((r) => r.userId)).toEqual([u.erik]);
		await approveAs("bert", (await pending(row?.id as string)) as string);
		expect((await holderRow(u.erik))?.status).toBe("revoked");
		expect(await rights()).toEqual([]);
	});

	it("Einladung: vorgemerkt per Adresse, beim Zurückziehen weg", async () => {
		const email = `neu-${stamp}@example.com`;
		await inOrg(async (tx) => {
			await tx.insert(roleAssignments).values({
				organizationId: orgId,
				function: "other",
				orgRoleId: roleId,
				pendingEmail: email,
				status: "appointed",
			});
			await syncMemberRoles(tx, orgId, null);
		});
		expect((await rights()).map((r) => r.email)).toEqual([email]);
		const audit = await inOrg((tx) => dropInvitedOwnRoles(tx, orgId, email));
		expect(audit.map((a) => a.action)).toContain(
			"role_assignment.invite_dropped",
		);
		expect(await rights()).toEqual([]);
	});
});
