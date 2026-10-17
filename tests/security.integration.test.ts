import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@/db";
import { generateDek, wrapDek } from "@/lib/crypto/envelope";
import { LocalKms, setKmsForTests } from "@/lib/crypto/kms";
import { decryptJson, fieldAad } from "@/lib/crypto/org-dek";
import { importScan } from "@/lib/security/import-service";
import { parseScanFile } from "@/lib/security/parsers";
import { newToken } from "@/lib/security/tokens";

// Integrationstest (DATABASE_URL_TEST): ADR-017-Policy (Token-Auflösung ohne
// Org-Kontext gibt genau eine Zeile frei) und Scan-Import mit Abgleich,
// Redaktion, verschlüsselten Details und Eskalation.

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;
const FAKE_SECRET = ["sk", "live", "4eC39HqLyjWDarjtT1zdp7dc"].join("_");

d("Security-Checks (Postgres)", () => {
	const client = postgres(url ?? "postgres://invalid", { max: 1 });
	const db = drizzle(client, { schema, casing: "snake_case" });
	let orgId = "";
	const tokenA = newToken("ingest");
	const tokenB = newToken("ingest");

	beforeAll(async () => {
		setKmsForTests(new LocalKms(new Map([[1, new Uint8Array(32)]]), 1));
		const wrapped = await wrapDek(await generateDek());
		const [org] = await client`
			insert into organization (name, slug, created_at)
			values ('Security Test', ${`sec-${Date.now()}`}, now()) returning id`;
		orgId = org?.id;
		await client.begin(async (tx) => {
			await tx`select set_config('app.org_id', ${orgId}, true)`;
			await tx`insert into org_settings (organization_id, encrypted_dek, key_version, sector)
				values (${orgId}, ${wrapped.wrapped}, ${wrapped.keyVersion}, 'other')`;
			for (const t of [tokenA, tokenB])
				await tx`insert into access_tokens (organization_id, kind, name, prefix, token_hash, scopes, expires_at)
					values (${orgId}, 'ingest', 'ci', ${t.prefix}, ${t.hash}, '["scan:write"]'::jsonb, now() + interval '30 days')`;
		});
	});

	afterAll(async () => {
		setKmsForTests(null);
		await client.begin(async (tx) => {
			await tx`select set_config('app.scope', 'platform', true)`;
			await tx`delete from organization where id = ${orgId}`;
		});
		await client.end({ timeout: 5 });
	});

	it("ohne Kontext unsichtbar; mit Hash genau die eine Zeile, nur lesend", async () => {
		const none = await client`select count(*)::int as n from access_tokens`;
		expect(none[0]?.n).toBe(0);
		await client.begin(async (tx) => {
			await tx`select set_config('app.token_hash', ${tokenA.hash}, true)`;
			const rows =
				await tx`select id, organization_id, token_hash from access_tokens`;
			expect(rows).toHaveLength(1);
			expect(rows[0]?.token_hash).toBe(tokenA.hash);
			expect(rows[0]?.organization_id).toBe(orgId);
			// andere Tabellen bleiben zu
			const s = await tx`select count(*)::int as n from security_findings`;
			expect(s[0]?.n).toBe(0);
			// Schreiben verbietet die Policy (nur SELECT)
			const upd = await tx`update access_tokens set name = 'x' returning id`;
			expect(upd).toHaveLength(0);
		});
		await client.begin(async (tx) => {
			await tx`select set_config('app.token_hash', ${"0".repeat(64)}, true)`;
			const rows = await tx`select id from access_tokens`;
			expect(rows).toHaveLength(0);
		});
	});

	async function run(text: string, name: string, fullScan: boolean) {
		const parsed = parseScanFile(text, name);
		if (!parsed.ok) throw new Error(parsed.error);
		return db.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
			return importScan(
				tx,
				{ orgId, userId: null },
				{
					parsed: parsed.scan,
					source: "api",
					fullScan,
					productId: null,
					raw: { text, fileName: name },
				},
			);
		});
	}

	const trivy = (vulns: { id: string; pkg: string; sev: string }[]) =>
		JSON.stringify({
			SchemaVersion: 2,
			ArtifactName: "repo",
			Results: [
				{
					Target: "package-lock.json",
					Vulnerabilities: vulns.map((v) => ({
						VulnerabilityID: v.id,
						PkgName: v.pkg,
						InstalledVersion: "1.0.0",
						FixedVersion: "1.0.1",
						Severity: v.sev,
						Title: `${v.id} in ${v.pkg}`,
					})),
				},
			],
		});

	it("Import: neu, Vollscan löst Fehlendes, Regression öffnet wieder, kritisch → Abweichung", async () => {
		const a = { id: "CVE-2026-0001", pkg: "a", sev: "CRITICAL" };
		const b = { id: "CVE-2026-0002", pkg: "b", sev: "HIGH" };
		const first = await run(trivy([a, b]), "trivy.json", true);
		expect(first.counts).toMatchObject({
			critical: 1,
			high: 1,
			new: 2,
			resolved: 0,
		});
		expect(first.openSeverities.sort()).toEqual(["critical", "high"]);
		expect(first.audits.some((x) => x.action === "nonconformity.create")).toBe(
			true,
		);

		const second = await run(trivy([b]), "trivy.json", true);
		expect(second.counts).toMatchObject({
			new: 0,
			resolved: 1,
			high: 1,
			critical: 0,
		});

		const third = await run(trivy([a, b]), "trivy.json", true);
		expect(third.counts).toMatchObject({ new: 0, reopened: 1, critical: 1 });

		const rows = await db.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
			return tx.select().from(schema.securityFindings);
		});
		const crit = rows.find((r) => r.cve === "CVE-2026-0001");
		expect(crit?.status).toBe("open");
		expect(crit?.reopenCount).toBe(1);
		expect(crit?.nonconformityId).toBeTruthy();
		expect(rows.find((r) => r.cve === "CVE-2026-0002")?.taskId).toBeTruthy();
	});

	it("gitleaks: Secret nie im Klartext, Details verschlüsselt", async () => {
		const text = JSON.stringify([
			{
				Description: "Stripe",
				File: "src/pay.ts",
				StartLine: 4,
				Secret: FAKE_SECRET,
				Match: `key="${FAKE_SECRET}"`,
				RuleID: "stripe-access-token",
				Fingerprint: "abc:src/pay.ts:stripe-access-token:4",
			},
		]);
		await run(text, "gitleaks.json", false);
		const rows = await db.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
			const r = await tx.select().from(schema.securityFindings);
			const leak = r.find((x) => x.category === "secret");
			const details = leak
				? await decryptJson<{ evidence: string }>(
						tx,
						orgId,
						leak.details,
						fieldAad("security_findings", leak.id, "details"),
					)
				: null;
			return { r, details };
		});
		const raw = JSON.stringify(rows.r);
		expect(raw).not.toContain(FAKE_SECRET);
		expect(rows.r.find((x) => x.category === "secret")?.details).toMatch(
			/^enc1:/,
		);
		expect(rows.details?.evidence).toContain("sk_l…(32 Zeichen)");
	});
});
