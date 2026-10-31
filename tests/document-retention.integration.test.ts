import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@/db";
import { documents, documentVersions, evidence } from "@/db/schema";
import { applyApprovalOutcome } from "@/lib/approvals/outcomes";
import {
	destroyVersion,
	dueDocumentRetention,
} from "@/lib/documents/destruction";
import { resetEnvCache } from "@/lib/env";

// Integrationstest (DATABASE_URL_TEST): Aufbewahrung und Vernichtung von
// Dokument-Fassungen (AP9.3). Der Trigger lässt genau den Übergang
// „vernichtet“ zu, nie für die gültige Fassung, nie zweimal; der Dienst
// vernichtet nur nach Ablauf der Aufbewahrung, löscht die Datei und lässt
// die Prüfsumme stehen; die Freigabe (outcomes) vernichtet mit der Begründung
// aus dem Antrag; fremde Orgs bleiben unberührt.

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

d("Aufbewahrung von Dokument-Fassungen (Postgres)", () => {
	const client = postgres(url ?? "postgres://invalid", { max: 1 });
	const db = drizzle(client, { schema, casing: "snake_case" });
	const stamp = Date.now();
	const orgs = { A: "", B: "" };
	let userId = "";
	const ids: Record<string, string> = {};
	const saved: Record<string, string | undefined> = {};
	const now = new Date("2026-10-31T10:00:00Z");

	type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
	const inOrg = <T>(orgId: string, fn: (tx: Tx) => Promise<T>) =>
		db.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
			return fn(tx);
		});
	const version = (id: string) =>
		inOrg(orgs.A, async (tx) => {
			const [v] = await tx
				.select()
				.from(documentVersions)
				.where(eq(documentVersions.id, id));
			return v;
		});

	beforeAll(async () => {
		for (const k of ["DATABASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL"])
			saved[k] = process.env[k];
		process.env.DATABASE_URL ??= url;
		process.env.BETTER_AUTH_SECRET ??= "x".repeat(40);
		process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
		resetEnvCache();
		const [u] = await client`
			insert into "user" (name, email, email_verified, created_at, updated_at)
			values ('Ret', ${`ret-${stamp}@example.org`}, true, now(), now()) returning id`;
		userId = u?.id;
		for (const name of ["A", "B"] as const) {
			const [org] = await client`
				insert into organization (name, slug, created_at)
				values (${`Ret ${name}`}, ${`ret-${name.toLowerCase()}-${stamp}`}, now()) returning id`;
			orgs[name] = org?.id;
		}
		await inOrg(orgs.A, async (tx) => {
			const [file] = await tx
				.insert(evidence)
				.values({
					organizationId: orgs.A,
					title: "Leitlinie v1 (Datei)",
					storageKey: "db:ret-test",
					source: "document",
				})
				.returning({ id: evidence.id });
			ids.file = file?.id ?? "";
			const mk = async (docNumber: string, years: number | null) => {
				const [doc] = await tx
					.insert(documents)
					.values({
						organizationId: orgs.A,
						docNumber: `${docNumber}-${stamp}`,
						title: docNumber,
						type: "policy",
						retentionYears: years,
						ownerUserId: userId,
					})
					.returning({ id: documents.id });
				return doc?.id ?? "";
			};
			ids.doc = await mk("POL-RET", 5);
			ids.docLong = await mk("POL-LONG", 30);
			const ver = async (
				documentId: string,
				v: string,
				published: string,
				file: string | null = null,
			) => {
				const [row] = await tx
					.insert(documentVersions)
					.values({
						organizationId: orgs.A,
						documentId,
						version: v,
						bodyMarkdown: `Text ${v}`,
						fileEvidenceId: file,
						changeSummary: `Fassung ${v}`,
						contentSha256: `sha-${v}`,
						approvedAt: new Date(published),
						publishedAt: new Date(published),
					})
					.returning({ id: documentVersions.id });
				return row?.id ?? "";
			};
			// v1 gilt 2014–2015, Aufbewahrung 5 Jahre bis 2020: fällig
			ids.v1 = await ver(ids.doc, "1.0", "2014-01-01T00:00:00Z", ids.file);
			ids.v2 = await ver(ids.doc, "2.0", "2015-01-01T00:00:00Z");
			ids.v3 = await ver(ids.doc, "3.0", "2016-01-01T00:00:00Z");
			ids.long1 = await ver(ids.docLong, "1.0", "2014-01-01T00:00:00Z");
			ids.long2 = await ver(ids.docLong, "2.0", "2015-01-01T00:00:00Z");
		});
	});

	afterAll(async () => {
		for (const [k, v] of Object.entries(saved))
			if (v === undefined) delete process.env[k];
			else process.env[k] = v;
		resetEnvCache();
		await client`delete from organization where id in (${orgs.A}, ${orgs.B})`;
		await client`delete from "user" where id = ${userId}`;
		await client.end();
	});

	it("Trigger: Inhalt leeren nur mit Vernichtung, nie die gültige Fassung", async () => {
		await expect(
			inOrg(orgs.A, (tx) =>
				tx
					.update(documentVersions)
					.set({ bodyMarkdown: null })
					.where(eq(documentVersions.id, ids.v1 ?? "")),
			),
		).rejects.toThrow();
		await expect(
			inOrg(orgs.A, (tx) =>
				tx
					.update(documentVersions)
					.set({ destroyedAt: now, bodyMarkdown: null })
					.where(eq(documentVersions.id, ids.v3 ?? "")),
			),
		).rejects.toThrow();
		// Prüfsumme bleibt auch beim Vernichten
		await expect(
			inOrg(orgs.A, (tx) =>
				tx
					.update(documentVersions)
					.set({ destroyedAt: now, bodyMarkdown: null, contentSha256: null })
					.where(eq(documentVersions.id, ids.v1 ?? "")),
			),
		).rejects.toThrow();
	});

	it("Tick listet nur fällige Fassungen", async () => {
		const due = await inOrg(orgs.A, (tx) =>
			dueDocumentRetention(tx, orgs.A, now),
		);
		const versions = due.map((x) => `${x.title} ${x.version}`).sort();
		expect(versions).toEqual(["POL-RET 1.0", "POL-RET 2.0"]);
		const other = await inOrg(orgs.B, (tx) =>
			dueDocumentRetention(tx, orgs.B, now),
		);
		expect(other).toEqual([]);
	});

	it("Dienst vernichtet nach Ablauf: Text und Datei weg, Prüfsumme bleibt", async () => {
		const res = await inOrg(orgs.A, (tx) =>
			destroyVersion(tx, {
				orgId: orgs.A,
				versionId: ids.v1 ?? "",
				userId,
				note: "Aufbewahrung abgelaufen, keine Prüfung offen",
				now,
			}),
		);
		expect(res.ok).toBe(true);
		const v = await version(ids.v1 ?? "");
		expect(v?.destroyedAt).not.toBeNull();
		expect(v?.bodyMarkdown).toBeNull();
		expect(v?.fileEvidenceId).toBeNull();
		expect(v?.contentSha256).toBe("sha-1.0");
		const files = await inOrg(orgs.A, (tx) =>
			tx
				.select()
				.from(evidence)
				.where(eq(evidence.id, ids.file ?? "")),
		);
		expect(files).toHaveLength(0);
		// zweimal geht nicht, auch nicht am Trigger vorbei
		const again = await inOrg(orgs.A, (tx) =>
			destroyVersion(tx, {
				orgId: orgs.A,
				versionId: ids.v1 ?? "",
				userId,
				note: "noch einmal vernichten",
				now,
			}),
		);
		expect(again).toEqual({ ok: false, error: "already_destroyed" });
		await expect(
			inOrg(orgs.A, (tx) =>
				tx
					.update(documentVersions)
					.set({ destructionNote: "geändert" })
					.where(eq(documentVersions.id, ids.v1 ?? "")),
			),
		).rejects.toThrow();
	});

	it("vor Ablauf und für die gültige Fassung abgelehnt", async () => {
		const notDue = await inOrg(orgs.A, (tx) =>
			destroyVersion(tx, {
				orgId: orgs.A,
				versionId: ids.long1 ?? "",
				userId,
				note: "zu früh vernichten",
				now,
			}),
		);
		expect(notDue).toEqual({ ok: false, error: "not_due" });
		const inForce = await inOrg(orgs.A, (tx) =>
			destroyVersion(tx, {
				orgId: orgs.A,
				versionId: ids.v3 ?? "",
				userId,
				note: "gültige Fassung vernichten",
				now,
			}),
		);
		expect(inForce).toEqual({ ok: false, error: "in_force" });
	});

	it("Freigabe vernichtet mit der Begründung aus dem Antrag", async () => {
		await inOrg(orgs.A, (tx) =>
			tx
				.update(documentVersions)
				.set({ destructionNote: "Freigegeben durch die GL" })
				.where(eq(documentVersions.id, ids.v2 ?? "")),
		);
		const audit = await inOrg(orgs.A, (tx) =>
			applyApprovalOutcome(
				tx,
				{ orgId: orgs.A, userId },
				{
					ok: true,
					status: "approved",
					requesterUserId: userId,
					entityType: "document",
					entityId: ids.doc ?? "",
					trigger: "document.destroy",
					entityVersionRef: "2.0",
				},
			),
		);
		expect(audit.map((a) => a.action)).toContain("document.version_destroyed");
		const v = await version(ids.v2 ?? "");
		expect(v?.destroyedAt).not.toBeNull();
		expect(v?.destructionNote).toBe("Freigegeben durch die GL");
		// fremde Org sieht die Fassungen nicht
		const seen = await inOrg(orgs.B, (tx) =>
			tx
				.select()
				.from(documentVersions)
				.where(and(eq(documentVersions.documentId, ids.doc ?? ""))),
		);
		expect(seen).toHaveLength(0);
	});
});
