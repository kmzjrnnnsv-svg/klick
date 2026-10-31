import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateDek, wrapDek } from "@/lib/crypto/envelope";
import { LocalKms, setKmsForTests } from "@/lib/crypto/kms";
import { testIdpKeys } from "./helpers/saml-idp";

// Integrationstest (DATABASE_URL_TEST): Einrichtungslink für die IT (AP10d).
// Der Link löst nur zu offenen, nicht abgelaufenen Anträgen seiner Org auf,
// nimmt genau einen Vorschlag an (Metadaten geprüft), benachrichtigt die
// Inhaber:innen und gilt nach dem Übernehmen nicht mehr.

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

d("SSO: Einrichtungslink für die IT (Postgres)", () => {
	const client = postgres(url ?? "postgres://invalid", { max: 1 });
	const stamp = Date.now();
	const o = { orgId: "", owner: "" };
	const inOrg = async <T>(fn: (tx: postgres.TransactionSql) => Promise<T>) =>
		client.begin(async (tx) => {
			await tx`select set_config('app.org_id', ${o.orgId}, true)`;
			return fn(tx);
		}) as Promise<T>;
	const make = async () => {
		const { createSetupLink } = await import("@/lib/auth/sso-setup-link");
		const { withOrg } = await import("@/lib/db/with-org");
		return withOrg({ orgId: o.orgId, userId: o.owner }, (tx) =>
			createSetupLink(
				tx,
				{ orgId: o.orgId, userId: o.owner },
				{
					vendor: "okta",
					domain: `it-${stamp}.test`,
					providerId: `saml-it-${stamp}`,
				},
			),
		);
	};

	beforeAll(async () => {
		setKmsForTests(new LocalKms(new Map([[1, new Uint8Array(32)]]), 1));
		const [owner] = await client`
			insert into "user" (name, email, email_verified, created_at, updated_at)
			values ('Inhaberin', ${`owner-${stamp}@example.org`}, true, now(), now())
			returning id`;
		const [org] = await client`
			insert into organization (name, slug, created_at)
			values ('IT-Link GmbH', ${`it-${stamp}`}, now()) returning id`;
		o.orgId = org?.id;
		o.owner = owner?.id;
		const wrapped = await wrapDek(await generateDek());
		await inOrg(
			(
				tx,
			) => tx`insert into org_settings (organization_id, encrypted_dek, key_version, sector)
				values (${o.orgId}, ${wrapped.wrapped}, ${wrapped.keyVersion}, 'other')`,
		);
		await client`insert into member (organization_id, user_id, role, created_at)
			values (${o.orgId}, ${o.owner}, 'owner', now())`;
	});

	afterAll(async () => {
		setKmsForTests(null);
		await client.begin(async (tx) => {
			await tx`select set_config('app.scope', 'platform', true)`;
			await tx`delete from organization where id = ${o.orgId}`;
		});
		await client`delete from "user" where email like ${`%${stamp}%`}`;
		await client.end({ timeout: 5 });
	});

	it("Link zeigt nur diese Verbindung und nimmt einen Vorschlag an", async () => {
		const { resolveSetupLink, submitProposal } = await import(
			"@/lib/auth/sso-setup-link"
		);
		const link = await make();
		expect(link.token.startsWith("klk_sso_")).toBe(true);
		const r = await resolveSetupLink(link.token);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.setup.view).toMatchObject({
			orgName: "IT-Link GmbH",
			vendor: "okta",
			domain: `it-${stamp}.test`,
			status: "open",
		});
		// kaputte Metadaten werden abgelehnt
		expect(
			await submitProposal(
				r.setup,
				{ contactName: "Alex", metadataXml: "<html/>", attributes: {} },
				{ ip: null, userAgent: null },
			),
		).toEqual({ ok: false, error: "sso_metadata_invalid" });
		const keys = testIdpKeys();
		const cert = keys.cert.replace(
			/-----(BEGIN|END) CERTIFICATE-----|\s+/g,
			"",
		);
		const xml = `<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" entityID="https://idp.example.org/it"><md:IDPSSODescriptor><md:KeyDescriptor use="signing"><ds:KeyInfo><ds:X509Data><ds:X509Certificate>${cert}</ds:X509Certificate></ds:X509Data></ds:KeyInfo></md:KeyDescriptor><md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://idp.example.org/it/sso"/></md:IDPSSODescriptor></md:EntityDescriptor>`;
		expect(
			await submitProposal(
				r.setup,
				{
					contactName: "Alex Muster",
					metadataXml: xml,
					attributes: { groups: "groups" },
				},
				{ ip: null, userAgent: null },
			),
		).toEqual({ ok: true });
		// einmal: der zweite Vorschlag wird abgelehnt
		const again = await resolveSetupLink(link.token);
		expect(again.ok && again.setup.view.status).toBe("submitted");
		if (!again.ok) return;
		expect(
			await submitProposal(
				again.setup,
				{ contactName: "Jemand", metadataXml: xml, attributes: {} },
				{ ip: null, userAgent: null },
			),
		).toEqual({ ok: false, error: "submitted" });
		const n = await inOrg(
			(tx) =>
				tx`select user_id from notifications where payload->>'dedupeKey' = ${`sso-setup:${r.setup.requestId}`}`,
		);
		expect(n.map((x) => x.user_id)).toEqual([o.owner]);
	});

	it("nach dem Übernehmen gilt der Link nicht mehr", async () => {
		const { closeSetupLink, resolveSetupLink } = await import(
			"@/lib/auth/sso-setup-link"
		);
		const { withOrg } = await import("@/lib/db/with-org");
		const link = await make();
		await withOrg({ orgId: o.orgId, userId: o.owner }, (tx) =>
			closeSetupLink(tx, o.orgId, link.requestId, "applied", o.owner),
		);
		const r = await resolveSetupLink(link.token);
		expect(r.ok).toBe(false);
		expect(!r.ok && r.error).toBe("revoked");
	});

	it("abgelaufen und falsche Art", async () => {
		const { resolveSetupLink } = await import("@/lib/auth/sso-setup-link");
		const link = await make();
		await inOrg(
			(tx) =>
				tx`update access_tokens set expires_at = now() - interval '1 minute' where subject_id = ${link.requestId}`,
		);
		const r = await resolveSetupLink(link.token);
		expect(!r.ok && r.error).toBe("expired");
		const wrong = link.token.replace("klk_sso_", "klk_trust_");
		const w = await resolveSetupLink(wrong);
		expect(!w.ok && w.error).toBe("invalid");
	});
});
