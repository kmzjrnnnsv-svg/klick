import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@/db";
import { documents, documentVersions, orgSettings } from "@/db/schema";
import { applyApprovalOutcome } from "@/lib/approvals/outcomes";
import { generateDek, wrapDek } from "@/lib/crypto/envelope";
import type { OrgTx } from "@/lib/db/with-org";
import { currentVersionsByDocument } from "@/lib/documents/in-force";
import {
	markVersionApproved,
	snapshotForReview,
} from "@/lib/documents/version-service";

// Integrationstest (DATABASE_URL_TEST): Dokument-Fassungen. Einreichen
// schreibt den Text der Arbeitskopie fest; freigegebene und veröffentlichte
// Fassungen sind in der Datenbank unveränderlich; eine Freigabe für eine
// ältere Fassung wirkt nicht; gültig ist die zuletzt veröffentlichte.

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

d("Dokument-Fassungen (Postgres)", () => {
	const client = postgres(url ?? "postgres://invalid", { max: 1 });
	const db = drizzle(client, { schema, casing: "snake_case" });
	const stamp = Date.now();
	let orgId = "";
	let userId = "";
	let docId = "";

	const inOrg = <T>(fn: (tx: OrgTx) => Promise<T>) =>
		db.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
			return fn(tx);
		});
	const docRow = () =>
		inOrg(async (tx) => {
			const [r] = await tx
				.select()
				.from(documents)
				.where(eq(documents.id, docId));
			if (!r) throw new Error("Dokument fehlt");
			return r;
		});
	const versionRow = (version: string) =>
		inOrg(async (tx) => {
			const [r] = await tx
				.select()
				.from(documentVersions)
				.where(
					and(
						eq(documentVersions.documentId, docId),
						eq(documentVersions.version, version),
					),
				);
			return r ?? null;
		});
	const setDoc = (patch: Partial<typeof documents.$inferInsert>) =>
		inOrg((tx) =>
			tx.update(documents).set(patch).where(eq(documents.id, docId)),
		);

	beforeAll(async () => {
		const [u] = await client`
			insert into "user" (name, email, email_verified, created_at, updated_at)
			values ('Anna', ${`fassung-${stamp}@example.com`}, true, now(), now())
			returning id`;
		userId = u?.id as string;
		const [o] = await client`
			insert into organization (name, slug, created_at)
			values ('Fassungen', ${`fassungen-${stamp}`}, now()) returning id`;
		orgId = o?.id as string;
		const wrapped = await wrapDek(await generateDek());
		await inOrg(async (tx) => {
			await tx.insert(orgSettings).values({
				organizationId: orgId,
				encryptedDek: wrapped.wrapped,
				keyVersion: wrapped.keyVersion,
			});
			const [doc] = await tx
				.insert(documents)
				.values({
					organizationId: orgId,
					docNumber: "RL-001",
					title: "Informationssicherheitsleitlinie",
					type: "policy",
					ownerUserId: userId,
					bodyMarkdown: "Text A",
					version: "0.1",
					changeSummary: "Erste Fassung",
				})
				.returning({ id: documents.id });
			docId = doc?.id as string;
		});
	});

	afterAll(async () => {
		// Kaskade: Fassungen fallen mit der Organisation (Trigger lässt das zu)
		if (orgId) await client`delete from organization where id = ${orgId}`;
		if (userId) await client`delete from "user" where id = ${userId}`;
		await client.end();
	});

	it("Einreichen schreibt den Text der Arbeitskopie fest", async () => {
		const doc = await docRow();
		const v = await inOrg((tx) => snapshotForReview(tx, orgId, doc, userId));
		expect(v).toBe("0.1");
		const row = await versionRow("0.1");
		expect(row?.bodyMarkdown).toBe("Text A");
		expect(row?.changeSummary).toBe("Erste Fassung");
		expect(row?.contentSha256).toMatch(/^[0-9a-f]{64}$/);

		// noch nicht freigegeben: erneutes Einreichen ersetzt den Text
		await setDoc({ bodyMarkdown: "Text B" });
		const docB = await docRow();
		await inOrg((tx) => snapshotForReview(tx, orgId, docB, userId));
		const again = await versionRow("0.1");
		expect(again?.bodyMarkdown).toBe("Text B");
		expect(again?.contentSha256).not.toBe(row?.contentSha256);
	});

	it("freigegeben und veröffentlicht: unveränderlich in der Datenbank", async () => {
		await inOrg((tx) => markVersionApproved(tx, docId, "0.1", userId));
		await inOrg((tx) =>
			tx
				.update(documentVersions)
				.set({ publishedAt: new Date() })
				.where(
					and(
						eq(documentVersions.documentId, docId),
						eq(documentVersions.version, "0.1"),
					),
				),
		);
		await setDoc({ status: "published" });

		await expect(
			inOrg((tx) =>
				tx
					.update(documentVersions)
					.set({ bodyMarkdown: "heimlich geändert" })
					.where(eq(documentVersions.documentId, docId)),
			),
		).rejects.toThrow();
		await expect(
			inOrg((tx) =>
				tx
					.update(documentVersions)
					.set({ approvedAt: new Date() })
					.where(eq(documentVersions.documentId, docId)),
			),
		).rejects.toThrow();
		await expect(
			inOrg((tx) =>
				tx
					.delete(documentVersions)
					.where(eq(documentVersions.documentId, docId)),
			),
		).rejects.toThrow();
		expect((await versionRow("0.1"))?.bodyMarkdown).toBe("Text B");

		const current = await inOrg((tx) => currentVersionsByDocument(tx, orgId));
		expect(current.get(docId)?.version).toBe("0.1");
	});

	it("belegte Nummer: Einreichen beginnt eine neue Fassung", async () => {
		// Altbestand: Arbeitskopie steht noch auf 0.1, Text geändert
		await setDoc({ status: "draft", bodyMarkdown: "Text C" });
		const docC = await docRow();
		const v = await inOrg((tx) =>
			snapshotForReview(tx, orgId, docC, userId, "Abschnitt 3"),
		);
		expect(v).toBe("0.2");
		expect((await docRow()).version).toBe("0.2");
		expect((await versionRow("0.2"))?.bodyMarkdown).toBe("Text C");
		expect((await versionRow("0.1"))?.bodyMarkdown).toBe("Text B");
		// bis zur Veröffentlichung gilt weiter 0.1
		const current = await inOrg((tx) => currentVersionsByDocument(tx, orgId));
		expect(current.get(docId)?.version).toBe("0.1");
	});

	it("Freigabe für eine ältere Fassung wirkt nicht", async () => {
		await setDoc({ status: "in_review" });
		const stale = await inOrg((tx) =>
			applyApprovalOutcome(
				tx,
				{ orgId, userId },
				{
					ok: true,
					status: "approved",
					requesterUserId: userId,
					entityType: "document",
					entityId: docId,
					trigger: "document.publish",
					entityVersionRef: "0.1",
				},
			),
		);
		expect(stale.map((a) => a.action)).toContain("document.approval_stale");
		expect((await docRow()).status).toBe("in_review");
		expect((await versionRow("0.2"))?.approvedAt).toBeNull();

		// dieselbe Entscheidung für die eingereichte Fassung wirkt
		await inOrg((tx) =>
			applyApprovalOutcome(
				tx,
				{ orgId, userId },
				{
					ok: true,
					status: "approved",
					requesterUserId: userId,
					entityType: "document",
					entityId: docId,
					trigger: "document.publish",
					entityVersionRef: "0.2",
				},
			),
		);
		expect((await docRow()).status).toBe("approved");
		expect((await versionRow("0.2"))?.approvedAt).not.toBeNull();
	});
});
