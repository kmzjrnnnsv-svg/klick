import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { schema } from "@/db";
import {
	approvalRequests,
	approvalWorkflows,
	documentSignatures,
	documents,
	documentVersions,
} from "@/db/schema";
import { decide } from "@/lib/approvals/service";
import type { SignedAssertion } from "@/lib/auth/passkey-sign";
import type { OrgTx } from "@/lib/db/with-org";
import {
	loadControlledSource,
	renderControlledPdf,
} from "@/lib/documents/controlled-export";
import {
	prepareDocumentSignText,
	storeDocumentSignature,
} from "@/lib/signatures/document";

// Integrationstest (DATABASE_URL_TEST): Freigabe im Umlauf mit Unterschrift
// (Dokumentenlenkung). Eine Stufe mit signature: true nimmt kein einfaches
// „Freigeben“ an; jede Person der Geschäftsleitung unterschreibt die
// eingereichte Fassung, erst dann ist der Antrag freigegeben. Unterschriften
// sind nur anhängend (kein UPDATE/DELETE unter RLS).

vi.mock("next-intl/server", () => ({
	getTranslations: async () => (key: string) => key,
}));

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

const fakeAssertion = (n: number): SignedAssertion => ({
	credentialId: `cred-${n}`,
	publicKey: "AA",
	authenticatorData: "AA",
	clientDataJSON: "AA",
	signature: "AA",
	userVerified: true,
	backupEligible: false,
	backupState: false,
	signCount: n,
});

d("Dokument-Freigabe mit Unterschrift (Postgres)", () => {
	const client = postgres(url ?? "postgres://invalid", { max: 1 });
	const db = drizzle(client, { schema, casing: "snake_case" });
	const stamp = Date.now();
	let orgId = "";
	let docId = "";
	let requestId = "";
	const u = { anna: "", bert: "", cleo: "" };
	const inOrg = <T>(fn: (tx: OrgTx) => Promise<T>) =>
		db.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
			return fn(tx);
		});
	const sign = (who: keyof typeof u, n: number) =>
		inOrg(async (tx) => {
			const prepared = await prepareDocumentSignText(tx, {
				orgId,
				userId: u[who],
				documentId: docId,
				function: "-",
			});
			if (!prepared) return null;
			return storeDocumentSignature(tx, {
				orgId,
				documentId: docId,
				fields: prepared.fields,
				signText: prepared.text,
				signerName: who,
				assertion: fakeAssertion(n),
				approvalRequestId: requestId,
			});
		});
	const decideAs = (who: keyof typeof u, signed: boolean) =>
		inOrg((tx) =>
			decide(
				tx,
				{ orgId, userId: u[who], name: who },
				{ requestId, decision: "approved", signed },
			),
		);

	beforeAll(async () => {
		for (const name of Object.keys(u) as (keyof typeof u)[]) {
			const [row] = await client`
				insert into "user" (name, email, email_verified, created_at, updated_at)
				values (${name}, ${`ds-${name}-${stamp}@example.com`}, true, now(), now())
				returning id`;
			u[name] = row?.id as string;
		}
		const [o] = await client`
			insert into organization (name, slug, created_at)
			values ('Unterschrift', ${`unterschrift-${stamp}`}, now()) returning id`;
		orgId = o?.id as string;
		for (const id of Object.values(u))
			await client`insert into member (organization_id, user_id, role, created_at)
				values (${orgId}, ${id}, 'owner', now())`;
		await inOrg(async (tx) => {
			const [doc] = await tx
				.insert(documents)
				.values({
					organizationId: orgId,
					docNumber: `RL-${stamp}`,
					title: "Leitlinie Informationssicherheit",
					version: "1.0",
					status: "in_review",
					bodyMarkdown: "Text",
				})
				.returning({ id: documents.id });
			docId = doc?.id as string;
			await tx.insert(documentVersions).values({
				organizationId: orgId,
				documentId: docId,
				version: "1.0",
				bodyMarkdown: "Text",
				changeSummary: "Erstfassung",
				contentSha256: "ab".repeat(32),
			});
			const steps = [
				{
					order: 1,
					approverRule: `user:${u.bert}`,
					approvers: [`user:${u.bert}`, `user:${u.cleo}`],
					mode: "all" as const,
					everyone: true,
					signature: true,
				},
			];
			const [wf] = await tx
				.insert(approvalWorkflows)
				.values({
					organizationId: orgId,
					entityType: "document",
					kind: `doc_sign_${stamp}`,
					name: "Dokument veröffentlichen",
					steps,
					enabled: true,
				})
				.returning({ id: approvalWorkflows.id });
			const [req] = await tx
				.insert(approvalRequests)
				.values({
					organizationId: orgId,
					workflowId: wf?.id as string,
					entityType: "document",
					entityId: docId,
					entityVersionRef: "1.0",
					requestedByUserId: u.anna,
					steps,
				})
				.returning({ id: approvalRequests.id });
			requestId = req?.id as string;
		});
	});

	afterAll(async () => {
		await client`delete from organization where id = ${orgId}`;
		await client`delete from "user" where id in ${client(Object.values(u))}`;
		await client.end();
	});

	it("einfaches Freigeben reicht nicht", async () => {
		const r = await decideAs("bert", false);
		expect(r).toEqual({ ok: false, error: "signature_required" });
	});

	it("zwei Unterschriften: erst dann freigegeben", async () => {
		const s1 = await sign("bert", 1);
		expect(s1?.target.version).toBe("1.0");
		const r1 = await decideAs("bert", true);
		expect(r1.ok && r1.status).toBe("pending");
		const s2 = await sign("cleo", 2);
		expect(s2).not.toBeNull();
		const r2 = await decideAs("cleo", true);
		expect(r2.ok && r2.status).toBe("approved");
		const rows = await inOrg((tx) =>
			tx
				.select({
					signer: documentSignatures.signerName,
					hash: documentSignatures.contentSha256,
				})
				.from(documentSignatures)
				.where(eq(documentSignatures.documentId, docId)),
		);
		expect(rows.map((r) => r.signer).sort()).toEqual(["bert", "cleo"]);
		expect(rows.every((r) => r.hash === "ab".repeat(32))).toBe(true);
	});

	it("nur anhängend: ändern und löschen wirken nicht", async () => {
		const changed = await inOrg((tx) =>
			tx
				.update(documentSignatures)
				.set({ signerName: "falsch" })
				.where(eq(documentSignatures.documentId, docId))
				.returning({ id: documentSignatures.id }),
		);
		expect(changed).toEqual([]);
		const gone = await inOrg((tx) =>
			tx
				.delete(documentSignatures)
				.where(eq(documentSignatures.documentId, docId))
				.returning({ id: documentSignatures.id }),
		);
		expect(gone).toEqual([]);
	});

	it("nicht mehr im Umlauf: keine Unterschrift", async () => {
		await inOrg((tx) =>
			tx
				.update(documents)
				.set({ status: "approved" })
				.where(eq(documents.id, docId)),
		);
		expect(await sign("anna", 3)).toBeNull();
	});

	it("PDF „Gelenkte Fassung“: Unterschriften, Prüfer-Sicht, Anhang", async () => {
		const env = { origin: "https://example.com", rpId: "example.com" };
		await inOrg(async (tx) => {
			const at = new Date("2026-10-20T10:00:00Z");
			await tx
				.update(documentVersions)
				.set({ approvedAt: at, publishedAt: at })
				.where(eq(documentVersions.documentId, docId));
			await tx
				.update(documents)
				.set({ status: "published" })
				.where(eq(documents.id, docId));
		});
		const src = await inOrg((tx) =>
			loadControlledSource(tx, orgId, docId, {
				view: "full",
				env,
				orgName: "Unterschrift",
			}),
		);
		expect(src?.version).toBe("1.0");
		expect(src?.input.version.state).toBe("current");
		expect(src?.signatures.map((x) => x.signerName).sort()).toEqual([
			"bert",
			"cleo",
		]);
		expect(src?.input.history[0]?.signers.sort()).toEqual(["bert", "cleo"]);
		// Prüfer-Sicht: nur die gültige Fassung
		const other = await inOrg((tx) =>
			loadControlledSource(tx, orgId, docId, {
				version: "0.9",
				view: "current",
				env,
				orgName: "Unterschrift",
			}),
		);
		expect(other).toBeNull();
		if (!src) return;
		const pdf = await renderControlledPdf(
			src,
			{ exportId: "e-1", by: "Test", at: new Date("2026-10-28T10:00:00Z") },
			env,
		);
		const text = Buffer.from(pdf).toString("latin1");
		expect(text.startsWith("%PDF-")).toBe(true);
		expect(text).toContain("signaturen.json");
	});
});
