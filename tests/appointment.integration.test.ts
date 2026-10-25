import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { schema } from "@/db";
import {
	approvalRequests,
	frameworks,
	orgFrameworks,
	orgSettings,
	resolutions,
	roleAssignments,
	tasks,
} from "@/db/schema";
import { applyApprovalOutcome } from "@/lib/approvals/outcomes";
import { decide, loadCandidates } from "@/lib/approvals/service";
import {
	proposeAssignment,
	proposeRevocation,
} from "@/lib/compliance/appointment-service";
import {
	createAppointmentsResolution,
	resolutionForApproval,
} from "@/lib/compliance/decision-service";
import { functionResponsible } from "@/lib/compliance/function-holders-service";
import { generateDek, wrapDek } from "@/lib/crypto/envelope";
import type { OrgTx } from "@/lib/db/with-org";

// Integrationstest (DATABASE_URL_TEST): Bestellung durch die
// Geschäftsleitung. Der erste GL-Eintrag gilt direkt; danach stimmen alle
// Mitglieder der GL zu; ein Vorschlag wirkt erst mit der Bestellung; die
// Bestellung erzeugt einen Beschluss und bei der GWB eine Anzeige-Aufgabe;
// abgelehnt bleibt mit Begründung stehen; Abberufung ohne die abberufene
// Person.

vi.mock("next-intl/server", () => ({
	getTranslations: async () => (key: string) => key,
}));

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

d("Bestellung durch die Geschäftsleitung (Postgres)", () => {
	const client = postgres(url ?? "postgres://invalid", { max: 1 });
	const db = drizzle(client, { schema, casing: "snake_case" });
	const stamp = Date.now();
	let orgId = "";
	const u: Record<"anna" | "bert" | "cleo" | "ines", string> = {
		anna: "",
		bert: "",
		cleo: "",
		ines: "",
	};
	const actor = (who: keyof typeof u) => ({
		orgId,
		userId: u[who],
		name: who,
	});

	const inOrg = <T>(fn: (tx: OrgTx) => Promise<T>) =>
		db.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
			return fn(tx);
		});
	const statusOf = (id: string) =>
		inOrg(async (tx) => {
			const [r] = await tx
				.select({
					s: roleAssignments.status,
					note: roleAssignments.decisionNote,
				})
				.from(roleAssignments)
				.where(eq(roleAssignments.id, id));
			return r;
		});
	const pendingRequest = (id: string) =>
		inOrg(async (tx) => {
			const [r] = await tx
				.select({ id: approvalRequests.id })
				.from(approvalRequests)
				.where(
					and(
						eq(approvalRequests.entityId, id),
						eq(approvalRequests.status, "pending"),
					),
				);
			return r?.id ?? null;
		});
	// wie app/actions/approvals.ts: entscheiden, Wirkung, Beschluss
	const decideAs = (
		who: keyof typeof u,
		requestId: string,
		decision: "approved" | "rejected",
		note?: string,
	) =>
		inOrg(async (tx) => {
			const r = await decide(tx, actor(who), { requestId, decision, note });
			if (!r.ok) return r;
			if (r.status !== "pending") {
				await applyApprovalOutcome(tx, { orgId, userId: u[who] }, r);
				await resolutionForApproval(tx, actor(who), requestId);
			}
			return r;
		});

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
			values ('Bestellung', ${`bestellung-${stamp}`}, now()) returning id`;
		orgId = o?.id as string;
		for (const id of Object.values(u))
			await client`insert into member (organization_id, user_id, role, created_at)
				values (${orgId}, ${id}, 'owner', now())`;
		const wrapped = await wrapDek(await generateDek());
		await inOrg(async (tx) => {
			await tx.insert(orgSettings).values({
				organizationId: orgId,
				encryptedDek: wrapped.wrapped,
				keyVersion: wrapped.keyVersion,
				licenceStage: "1_agent",
			});
			const fws = await tx
				.select({ id: frameworks.id })
				.from(frameworks)
				.where(eq(frameworks.slug, "gwg"));
			if (fws[0])
				await tx
					.insert(orgFrameworks)
					.values({ organizationId: orgId, frameworkId: fws[0].id });
		});
	});

	afterAll(async () => {
		if (orgId) await client`delete from organization where id = ${orgId}`;
		for (const id of Object.values(u))
			await client`delete from "user" where id = ${id}`;
		await client.end();
	});

	it("erste Geschäftsleitung gilt direkt, Einzel-GL bestellt selbst", async () => {
		const first = await inOrg((tx) =>
			proposeAssignment(
				tx,
				actor("ines"),
				{ function: "management_body", userId: u.anna },
				"test",
			),
		);
		expect(first.status).toBe("appointed");
		// Anna ist allein in der GL: ihr Eintrag ist die Bestellung
		const second = await inOrg((tx) =>
			proposeAssignment(
				tx,
				actor("anna"),
				{ function: "management_body", userId: u.bert },
				"test",
			),
		);
		expect(second.status).toBe("appointed");
	});

	it("weitere GL: alle bestehenden Mitglieder stimmen zu", async () => {
		const out = await inOrg((tx) =>
			proposeAssignment(
				tx,
				actor("ines"),
				{ function: "management_body", userId: u.cleo },
				"test",
			),
		);
		expect(out).toMatchObject({ status: "proposed", waiting: "approval" });
		const req = (await pendingRequest(out.id)) as string;
		expect((await decideAs("anna", req, "approved")).ok).toBe(true);
		expect((await statusOf(out.id))?.s).toBe("proposed");
		await decideAs("bert", req, "approved");
		expect((await statusOf(out.id))?.s).toBe("appointed");
	});

	it("Vorschlag wirkt erst mit der Bestellung, dann Beschluss mit allen", async () => {
		const out = await inOrg((tx) =>
			proposeAssignment(
				tx,
				actor("ines"),
				{ function: "isb_ciso", userId: u.ines },
				"test",
			),
		);
		expect(out.waiting).toBe("approval");
		const before = await inOrg(async (tx) => ({
			responsible: await functionResponsible(tx, orgId, "isb_ciso"),
			fns: (await loadCandidates(tx, orgId)).find((c) => c.userId === u.ines)
				?.functions,
		}));
		expect(before.responsible).toBeNull();
		expect(before.fns).not.toContain("isb_ciso");
		const req = (await pendingRequest(out.id)) as string;
		for (const who of ["anna", "bert", "cleo"] as const)
			await decideAs(who, req, "approved");
		expect((await statusOf(out.id))?.s).toBe("appointed");
		const after = await inOrg(async (tx) => ({
			responsible: await functionResponsible(tx, orgId, "isb_ciso"),
			res: await tx
				.select({
					code: resolutions.requiredCode,
					attendees: resolutions.attendeeUserIds,
				})
				.from(resolutions)
				.where(eq(resolutions.approvalRequestId, req)),
		}));
		expect(after.responsible).toBe(u.ines);
		// Bestellungsschreiben automatisch erzeugt und verknüpft
		const [letter] = await inOrg((tx) =>
			tx
				.select({ evidenceId: roleAssignments.evidenceId })
				.from(roleAssignments)
				.where(eq(roleAssignments.id, out.id)),
		);
		expect(letter?.evidenceId).toBeTruthy();
		expect(after.res).toHaveLength(1);
		expect(after.res[0]?.code).toBe("RES-ROLES");
		expect([...(after.res[0]?.attendees ?? [])].sort()).toEqual(
			[u.anna, u.bert, u.cleo].sort(),
		);
	});

	it("GWB: Pflichtbeschluss und Anzeige an die BaFin als Aufgabe", async () => {
		const out = await inOrg((tx) =>
			proposeAssignment(
				tx,
				actor("anna"),
				{ function: "aml_officer", userId: u.ines, appointedAt: "2099-01-01" },
				"test",
			),
		);
		const req = (await pendingRequest(out.id)) as string;
		// Anna hat eingetragen (zählt), Bert und Cleo fehlen
		await decideAs("bert", req, "approved");
		await decideAs("cleo", req, "approved");
		expect((await statusOf(out.id))?.s).toBe("appointed");
		const rows = await inOrg(async (tx) => ({
			res: await tx
				.select({ code: resolutions.requiredCode })
				.from(resolutions)
				.where(eq(resolutions.approvalRequestId, req)),
			tasks: await tx
				.select({ title: tasks.title, dueAt: tasks.dueAt })
				.from(tasks)
				.where(eq(tasks.entityId, out.id)),
		}));
		expect(rows.res[0]?.code).toBe("RES-GWG-AMLO");
		expect(rows.tasks).toHaveLength(1);
		expect(rows.tasks[0]?.dueAt).toBe("2099-01-01");
		expect(rows.tasks[0]?.title).toContain("BaFin");
	});

	it("Ablehnung bleibt mit Begründung stehen", async () => {
		const out = await inOrg((tx) =>
			proposeAssignment(
				tx,
				actor("ines"),
				{ function: "dpo", userId: u.anna },
				"test",
			),
		);
		const req = (await pendingRequest(out.id)) as string;
		await decideAs("bert", req, "rejected", "DSB darf nicht GL sein");
		const s = await statusOf(out.id);
		expect(s?.s).toBe("rejected");
		expect(s?.note).toBe("DSB darf nicht GL sein");
	});

	it("Abberufung: GL ohne die abberufene Person, wirkt erst danach", async () => {
		const isb = await inOrg(async (tx) => {
			const [r] = await tx
				.select({ id: roleAssignments.id })
				.from(roleAssignments)
				.where(eq(roleAssignments.function, "isb_ciso"));
			return r?.id as string;
		});
		const res = await inOrg((tx) =>
			proposeRevocation(tx, actor("anna"), isb, "test"),
		);
		expect(res).toMatchObject({ ok: true, status: "revocation_requested" });
		// gilt bis zur Freigabe weiter
		expect(
			await inOrg((tx) => functionResponsible(tx, orgId, "isb_ciso")),
		).toBe(u.ines);
		const req = (await pendingRequest(isb)) as string;
		await decideAs("bert", req, "approved");
		await decideAs("cleo", req, "approved");
		expect((await statusOf(isb))?.s).toBe("revoked");
		expect(
			await inOrg((tx) => functionResponsible(tx, orgId, "isb_ciso")),
		).toBeNull();
	});
	it("mehrere Bestellungen auf einmal: ein gemeinsamer Beschluss", async () => {
		const ids: string[] = [];
		for (const fn of ["bcm_manager", "incident_manager"] as const) {
			const out = await inOrg((tx) =>
				proposeAssignment(
					tx,
					actor("ines"),
					{ function: fn, userId: u.ines },
					"test",
				),
			);
			ids.push(out.id);
		}
		const reqs = await Promise.all(ids.map((id) => pendingRequest(id)));
		// wie decideAppointments: entscheiden, Wirkung, dann ein Beschluss
		await inOrg(async (tx) => {
			for (const who of ["anna", "bert", "cleo"] as const)
				for (const req of reqs) {
					const r = await decide(tx, actor(who), {
						requestId: req as string,
						decision: "approved",
					});
					if (r.ok && r.status === "approved")
						await applyApprovalOutcome(tx, { orgId, userId: u[who] }, r);
				}
			await createAppointmentsResolution(tx, actor("cleo"), reqs as string[]);
		});
		for (const id of ids) expect((await statusOf(id))?.s).toBe("appointed");
		const [res] = await inOrg((tx) =>
			tx
				.select({
					subject: resolutions.subject,
					code: resolutions.requiredCode,
				})
				.from(resolutions)
				.where(eq(resolutions.approvalRequestId, reqs[0] as string)),
		);
		expect(res?.code).toBe("RES-ROLES");
		expect(res?.subject).toContain("bcm_manager");
		expect(res?.subject).toContain("incident_manager");
	});
});
