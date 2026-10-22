import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrustCenterSettings, TrustSnapshot } from "@/db/schema";
import { newToken } from "@/lib/security/tokens";

// Integrationstest (DATABASE_URL_TEST): Trust Center. Ohne Org-Kontext sind
// nur veröffentlichte Zeilen lesbar (Policy trust_centers_public), nie
// schreibbar; Anfragen landen in der Org des Slugs; der Zugangstoken gilt
// nur für die freigegebene Anfrage und nur bis zum Widerruf.

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

const settings: TrustCenterSettings = {
	title: "T",
	intro: "",
	contactEmail: null,
	ndaText: "Vertraulich behandeln, bitte.",
	indexable: false,
	showCoverage: false,
	showControls: false,
	showSubprocessors: false,
	frameworks: [],
	documents: [],
};
const snapshot: TrustSnapshot = {
	orgName: "A",
	title: "T",
	intro: "",
	contactEmail: null,
	ndaText: settings.ndaText,
	ndaVersion: "0123456789abcdef",
	indexable: false,
	frameworks: [],
	domains: null,
	subprocessors: null,
	documents: [],
	generatedAt: new Date().toISOString(),
};

d("Trust Center (Postgres)", () => {
	const client = postgres(url ?? "postgres://invalid", { max: 1 });
	const stamp = Date.now();
	const slugA = `tc-a-${stamp}`;
	const slugB = `tc-b-${stamp}`;
	let orgA = "";
	let orgB = "";

	const inOrg = <T>(
		orgId: string,
		fn: (tx: postgres.TransactionSql) => Promise<T>,
	) =>
		client.begin(async (tx) => {
			await tx`select set_config('app.org_id', ${orgId}, true)`;
			return fn(tx);
		}) as Promise<T>;

	beforeAll(async () => {
		process.env.DATABASE_URL = url;
		const [a] = await client`
			insert into organization (name, slug, created_at)
			values ('Trust A', ${`trust-a-${stamp}`}, now()) returning id`;
		const [b] = await client`
			insert into organization (name, slug, created_at)
			values ('Trust B', ${`trust-b-${stamp}`}, now()) returning id`;
		orgA = a?.id;
		orgB = b?.id;
		await inOrg(
			orgA,
			(tx) =>
				tx`insert into trust_centers (organization_id, slug, published, settings, snapshot, published_at)
				values (${orgA}, ${slugA}, true, ${tx.json(settings)}, ${tx.json(snapshot)}, now())`,
		);
		await inOrg(
			orgB,
			(tx) =>
				tx`insert into trust_centers (organization_id, slug, published, settings)
				values (${orgB}, ${slugB}, false, ${tx.json(settings)})`,
		);
	});

	afterAll(async () => {
		await client.begin(async (tx) => {
			await tx`select set_config('app.scope', 'platform', true)`;
			await tx`delete from organization where id in (${orgA}, ${orgB})`;
		});
		await client.end({ timeout: 5 });
	});

	it("ohne Kontext: nur veröffentlichte Zeilen, nie schreibbar", async () => {
		const rows =
			await client`select slug from trust_centers where slug in (${slugA}, ${slugB})`;
		expect(rows.map((r) => r.slug)).toEqual([slugA]);
		const upd = await client`
			update trust_centers set published = true where slug = ${slugB} returning id`;
		expect(upd).toHaveLength(0);
		const req =
			await client`select count(*)::int as n from trust_access_requests`;
		expect(req[0]?.n).toBe(0);
	});

	it("fremde Org liest die veröffentlichte Zeile, ändert sie aber nicht", async () => {
		await inOrg(orgB, async (tx) => {
			const rows =
				await tx`select slug from trust_centers where slug in (${slugA}, ${slugB}) order by slug`;
			expect(rows.map((r) => r.slug)).toEqual([slugA, slugB]);
			const upd =
				await tx`update trust_centers set published = false where slug = ${slugA} returning id`;
			expect(upd).toHaveLength(0);
		});
	});

	it("publicTrustCenter liefert nur Veröffentlichtes", async () => {
		const { publicTrustCenter } = await import("@/lib/db/trust");
		const a = await publicTrustCenter(slugA);
		expect(a?.organizationId).toBe(orgA);
		expect(a?.snapshot.ndaVersion).toBe(snapshot.ndaVersion);
		expect(await publicTrustCenter(slugB)).toBeNull();
		expect(await publicTrustCenter("Ungültig!")).toBeNull();
	});

	it("Anfrage landet in der Org des Slugs; Token gilt bis zum Widerruf", async () => {
		const { publicTrustCenter } = await import("@/lib/db/trust");
		const { createTrustRequest, resolveTrustAccess } = await import(
			"@/lib/trust/access"
		);
		const center = await publicTrustCenter(slugA);
		if (!center) throw new Error("center missing");
		const input = {
			center,
			name: "Pia Prüferin",
			email: "pia@example.test",
			company: "Prüf AG",
			reason: null,
			ndaVersion: snapshot.ndaVersion,
			ip: "203.0.113.7",
			userAgent: "vitest",
		};
		expect(await createTrustRequest(input)).toEqual({ created: true });
		// gleiche Adresse, offene Anfrage → keine zweite Zeile
		expect(await createTrustRequest(input)).toEqual({ created: false });
		const rows = await inOrg(
			orgA,
			(tx) => tx`select id, ip_hash from trust_access_requests`,
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.ip_hash).not.toContain("203.0.113.7");
		const inB = await inOrg(
			orgB,
			(tx) => tx`select id from trust_access_requests`,
		);
		expect(inB).toHaveLength(0);

		const requestId = rows[0]?.id as string;
		const t = newToken("trust_center");
		const tokenRow = await inOrg(orgA, async (tx) => {
			const [tok] = await tx`
				insert into access_tokens (organization_id, kind, name, prefix, token_hash, scopes, subject_type, subject_id, expires_at)
				values (${orgA}, 'trust_center', 'Trust', ${t.prefix}, ${t.hash}, '["trust:read"]'::jsonb, 'trust_request', ${requestId}, now() + interval '14 days')
				returning id`;
			await tx`update trust_access_requests
				set status = 'approved', token_id = ${tok?.id}, expires_at = now() + interval '14 days'
				where id = ${requestId}`;
			return tok;
		});
		const ok = await resolveTrustAccess(t.token, center);
		expect(ok.ok).toBe(true);
		if (ok.ok) expect(ok.access.request.id).toBe(requestId);

		// Token einer anderen Org passt nicht zum Trust Center
		const other = { ...center, organizationId: orgB };
		expect((await resolveTrustAccess(t.token, other)).ok).toBe(false);

		await inOrg(orgA, async (tx) => {
			await tx`update access_tokens set revoked_at = now() where id = ${tokenRow?.id}`;
			await tx`update trust_access_requests set status = 'revoked' where id = ${requestId}`;
		});
		const revoked = await resolveTrustAccess(t.token, center);
		expect(revoked).toEqual({ ok: false, error: "revoked" });
	});
});
