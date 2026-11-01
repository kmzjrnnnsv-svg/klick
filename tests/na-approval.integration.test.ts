import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { schema } from "@/db";
import {
	approvalRequests,
	assessmentAnswers,
	assessments,
	controlImplementations,
	controls,
	frameworks,
	orgFrameworks,
	orgSettings,
	requirementApplicability,
	requirements,
	roleAssignments,
} from "@/db/schema";
import type { AssessmentQuestion } from "@/db/schema/enums";
import { applyApprovalOutcome } from "@/lib/approvals/outcomes";
import { decide } from "@/lib/approvals/service";
import {
	applyControlNa,
	controlNaRef,
	naConfirmations,
	requestControlNa,
	requestNaConfirmation,
	withdrawNaConfirmation,
} from "@/lib/assessments/na-approval";
import { EDGES_BY_CONTROL } from "@/lib/compliance/catalog";
import { ensureControlImplementations } from "@/lib/compliance/initialize-org";
import { generateDek, wrapDek } from "@/lib/crypto/envelope";
import type { OrgTx } from "@/lib/db/with-org";

// Integrationstest (DATABASE_URL_TEST): „Nicht relevant“ wirkt erst
// bestätigt. Antwort stellt einen Antrag an die Geschäftsleitung; dieselbe
// Begründung stellt keinen zweiten; bestätigt wirkt sie (vor dem Übernehmen
// über das Übernehmen, danach beim Freigeben); abgelehnt bleibt ohne
// Wirkung; „nicht anwendbar“ an der Control-Seite geht denselben Weg.

vi.mock("next-intl/server", () => ({
	getTranslations: async () => (key: string) => key,
}));

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

const CONTROL = "CC-OPS-08";
const iso = (EDGES_BY_CONTROL.get(CONTROL) ?? []).filter((e) =>
	e.requirement.startsWith("iso27001:"),
);
const annex = iso.find((e) => e.coverage === "full")?.requirement ?? "";
const keys = iso.map((e) => e.requirement);

d("„Nicht relevant“ mit Bestätigung (Postgres)", () => {
	const client = postgres(url ?? "postgres://invalid", { max: 1 });
	const db = drizzle(client, { schema, casing: "snake_case" });
	const stamp = Date.now();
	let orgId = "";
	let implId = "";
	let assessmentId = "";
	const u: Record<"anna" | "bert", string> = { anna: "", bert: "" };
	const actor = (who: keyof typeof u) => ({ orgId, userId: u[who], name: who });

	const inOrg = <T>(fn: (tx: OrgTx) => Promise<T>) =>
		db.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
			return fn(tx);
		});
	const decideAs = (
		who: keyof typeof u,
		requestId: string,
		decision: "approved" | "rejected",
		note?: string,
	) =>
		inOrg(async (tx) => {
			const r = await decide(tx, actor(who), { requestId, decision, note });
			if (r.ok && r.status !== "pending")
				await applyApprovalOutcome(tx, { orgId, userId: u[who] }, r);
			return r;
		});
	const pending = () =>
		inOrg((tx) =>
			tx
				.select({
					id: approvalRequests.id,
					ref: approvalRequests.entityVersionRef,
				})
				.from(approvalRequests)
				.where(
					and(
						eq(approvalRequests.entityId, implId),
						eq(approvalRequests.status, "pending"),
					),
				),
		);
	const answer = (reason: string) =>
		inOrg(async (tx) => {
			await tx
				.insert(assessmentAnswers)
				.values({
					organizationId: orgId,
					assessmentId,
					questionCode: "Q1",
					answer: "na",
					naReason: reason,
					answeredByUserId: u.bert,
				})
				.onConflictDoUpdate({
					target: [
						assessmentAnswers.assessmentId,
						assessmentAnswers.questionCode,
					],
					set: { answer: "na", naReason: reason },
				});
			return requestNaConfirmation(tx, actor("bert"), {
				assessmentId,
				assessmentCode: "GA-TEST",
				questionCode: "Q1",
				controlImplementationId: implId,
				reason,
			});
		});
	const state = (reason: string) =>
		inOrg(async (tx) =>
			(
				await naConfirmations(tx, orgId, assessmentId, [
					{ questionCode: "Q1", answer: "na", naReason: reason },
				])
			).get("Q1"),
		);
	const implStatus = () =>
		inOrg(async (tx) => {
			const [r] = await tx
				.select({
					status: controlImplementations.status,
					note: controlImplementations.note,
				})
				.from(controlImplementations)
				.where(eq(controlImplementations.id, implId));
			return r;
		});
	const annexExcluded = () =>
		inOrg(async (tx) => {
			const code = annex.slice(annex.indexOf(":") + 1);
			const rows = await tx
				.select({ applicable: requirementApplicability.applicable })
				.from(requirementApplicability)
				.innerJoin(
					requirements,
					eq(requirements.id, requirementApplicability.requirementId),
				)
				.innerJoin(frameworks, eq(frameworks.id, requirements.frameworkId))
				.where(
					and(
						eq(requirementApplicability.organizationId, orgId),
						eq(frameworks.slug, "iso27001"),
						eq(requirements.code, code),
						eq(requirementApplicability.source, "manual"),
					),
				);
			return rows.some((r) => !r.applicable);
		});

	beforeAll(async () => {
		for (const name of Object.keys(u) as (keyof typeof u)[]) {
			const [row] = await client`
				insert into "user" (name, email, email_verified, created_at, updated_at)
				values (${name}, ${`na-${name}-${stamp}@example.com`}, true, now(), now())
				returning id`;
			u[name] = row?.id as string;
		}
		const [o] = await client`
			insert into organization (name, slug, created_at)
			values ('Nicht relevant', ${`na-${stamp}`}, now()) returning id`;
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
			const [fw] = await tx
				.select({ id: frameworks.id })
				.from(frameworks)
				.where(eq(frameworks.slug, "iso27001"));
			if (fw)
				await tx
					.insert(orgFrameworks)
					.values({ organizationId: orgId, frameworkId: fw.id });
			// Anna ist bestellte Geschäftsleitung
			await tx.insert(roleAssignments).values({
				organizationId: orgId,
				function: "management_body",
				userId: u.anna,
				status: "appointed",
				appointedAt: new Date().toISOString().slice(0, 10),
			});
			await ensureControlImplementations(tx, orgId, u.bert, [CONTROL]);
			const [impl] = await tx
				.select({ id: controlImplementations.id })
				.from(controlImplementations)
				.innerJoin(controls, eq(controls.id, controlImplementations.controlId))
				.where(
					and(
						eq(controlImplementations.organizationId, orgId),
						eq(controls.code, CONTROL),
					),
				);
			implId = impl?.id as string;
			const question: AssessmentQuestion = {
				code: "Q1",
				sectionCode: "S",
				sectionTitle: "S",
				text: "Betrieb dokumentiert?",
				controlCode: CONTROL,
				requirements: keys,
				frameworks: ["iso27001"],
				weight: keys.length,
			};
			const [a] = await tx
				.insert(assessments)
				.values({
					organizationId: orgId,
					code: "GA-TEST",
					kind: "self",
					templateCode: "catalog",
					title: "Gap-Analyse",
					questions: [question],
					frameworks: ["iso27001"],
				})
				.returning({ id: assessments.id });
			assessmentId = a?.id as string;
		});
	});

	afterAll(async () => {
		if (orgId) await client`delete from organization where id = ${orgId}`;
		for (const id of Object.values(u))
			await client`delete from "user" where id = ${id}`;
		await client.end();
	});

	it("Beispiel aus dem Katalog: A.5.37 ganz, 8.1 nur teilweise", () => {
		expect(annex.startsWith("iso27001:A.")).toBe(true);
		expect(keys.length).toBe(2);
	});

	it("Antwort stellt einen Antrag, dieselbe Begründung keinen zweiten", async () => {
		const first = await answer("Keine eigene Entwicklung im Haus");
		expect(first.status).toBe("pending");
		const again = await answer("Keine eigene Entwicklung im Haus");
		expect(again.status).toBe("pending");
		expect(await pending()).toHaveLength(1);
		// vor der Bestätigung keine Wirkung
		expect((await implStatus())?.status).toBe("not_started");
	});

	it("bestätigt vor dem Übernehmen: Stand bestätigt, Wirkung erst beim Übernehmen", async () => {
		const [req] = await pending();
		const r = await decideAs("anna", req?.id as string, "approved");
		expect(r.ok && r.status).toBe("approved");
		expect(await state("Keine eigene Entwicklung im Haus")).toMatchObject({
			status: "confirmed",
			by: "anna",
		});
		expect((await implStatus())?.status).toBe("not_started");
	});

	it("geänderte Begründung braucht eine neue Bestätigung", async () => {
		const out = await answer("Software beziehen wir nur als Dienst");
		expect(out.status).toBe("pending");
		expect(await state("Keine eigene Entwicklung im Haus")).toMatchObject({
			status: "confirmed",
		});
		expect(await state("Software beziehen wir nur als Dienst")).toMatchObject({
			status: "pending",
		});
	});

	it("bestätigt nach dem Übernehmen: Ausschluss und Maßnahme entfällt", async () => {
		await inOrg((tx) =>
			tx
				.update(assessments)
				.set({ status: "completed", appliedAt: new Date() })
				.where(eq(assessments.id, assessmentId)),
		);
		const [req] = await pending();
		await decideAs("anna", req?.id as string, "approved");
		expect((await implStatus())?.status).toBe("not_applicable");
		expect(await annexExcluded()).toBe(true);
	});

	it("abgelehnt: ohne Wirkung, dieselbe Begründung stellt keinen neuen Antrag", async () => {
		await inOrg((tx) =>
			tx
				.update(assessments)
				.set({ status: "in_progress", appliedAt: null })
				.where(eq(assessments.id, assessmentId)),
		);
		await answer("Nur Standardsoftware ohne Anpassung");
		const [req] = await pending();
		await decideAs("anna", req?.id as string, "rejected", "Bitte genauer");
		expect(await state("Nur Standardsoftware ohne Anpassung")).toMatchObject({
			status: "rejected",
			note: "Bitte genauer",
		});
		const again = await answer("Nur Standardsoftware ohne Anpassung");
		expect(again.status).toBe("rejected");
		expect(await pending()).toHaveLength(0);
	});

	it("andere Antwort zieht den offenen Antrag zurück", async () => {
		await answer("Neue Begründung mit genug Zeichen");
		expect(await pending()).toHaveLength(1);
		const n = await inOrg((tx) =>
			withdrawNaConfirmation(tx, orgId, assessmentId, "Q1"),
		);
		expect(n).toBe(1);
		expect(await pending()).toHaveLength(0);
	});

	it("Control-Seite: „nicht anwendbar“ wartet, wirkt mit der Bestätigung", async () => {
		await inOrg((tx) =>
			tx
				.update(controlImplementations)
				.set({ status: "in_progress" })
				.where(eq(controlImplementations.id, implId)),
		);
		const reason = "Betrieb komplett beim Dienstleister";
		const out = await inOrg(async (tx) => {
			const g = await requestControlNa(tx, actor("bert"), {
				implementationId: implId,
				code: CONTROL,
				title: "Betrieb",
				reason,
			});
			// wie die Action: Begründung an die Umsetzung, Status bleibt
			await tx
				.update(controlImplementations)
				.set({ note: reason })
				.where(eq(controlImplementations.id, implId));
			return g;
		});
		expect(out.status).toBe("pending");
		expect((await implStatus())?.status).toBe("in_progress");
		// Begründung inzwischen geändert: die Bestätigung wirkt nicht
		const stale = await inOrg((tx) =>
			applyControlNa(tx, orgId, implId, controlNaRef("etwas anderes")),
		);
		expect(stale).toEqual([]);
		const [req] = await pending();
		expect(req?.ref).toBe(controlNaRef(reason));
		await decideAs("anna", req?.id as string, "approved");
		expect(await implStatus()).toMatchObject({
			status: "not_applicable",
			note: reason,
		});
	});
});
