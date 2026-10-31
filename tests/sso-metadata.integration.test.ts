import { inflateRawSync } from "node:zlib";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateDek, wrapDek } from "@/lib/crypto/envelope";
import { LocalKms, setKmsForTests } from "@/lib/crypto/kms";
import { type IdpKeys, samlResponse, testIdpKeys } from "./helpers/saml-idp";

// Integrationstest (DATABASE_URL_TEST): Zertifikat eines SAML-Anbieters
// beobachten (AP10c). Neues Zertifikat in den Metadaten → vorgemerkt und
// gemeldet (einmal), nie automatisch übernommen; Übernahme prüft Stand und
// Entity-ID; danach klappt die Anmeldung mit dem neuen Schlüssel. Ablauf in
// 7 Tagen → eine Erinnerung.

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

const b64 = (pem: string) =>
	pem.replace(/-----(BEGIN|END) CERTIFICATE-----/g, "").replace(/\s+/g, "");

d("SSO: Metadaten beobachten und Zertifikat übernehmen (Postgres)", () => {
	const client = postgres(url ?? "postgres://invalid", { max: 1 });
	const stamp = Date.now();
	const origin = new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000")
		.origin;
	let keysA: IdpKeys;
	let keysB: IdpKeys;
	const idpEntityId = `https://idp.example.org/meta-${stamp}`;
	const metaUrl = `https://idp.example.org/meta-${stamp}/metadata`;
	const o = {
		orgId: "",
		owner: "",
		providerId: `saml-meta-${stamp}`,
		domain: `meta-${stamp}.test`,
	};
	const metadata = (keys: IdpKeys, entityId = idpEntityId) =>
		`<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" entityID="${entityId}"><md:IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol"><md:KeyDescriptor use="signing"><ds:KeyInfo><ds:X509Data><ds:X509Certificate>${b64(keys.cert)}</ds:X509Certificate></ds:X509Data></ds:KeyInfo></md:KeyDescriptor><md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://idp.example.org/meta-${stamp}/sso"/></md:IDPSSODescriptor></md:EntityDescriptor>`;
	let served = "";
	const fetcher = async (u: string) => {
		if (u !== metaUrl)
			return { ok: false as const, error: "sso_metadata_fetch" };
		const { readIdpMetadata } = await import("@/lib/auth/sso-setup-service");
		return readIdpMetadata(served);
	};
	const inOrg = async <T>(fn: (tx: postgres.TransactionSql) => Promise<T>) =>
		client.begin(async (tx) => {
			await tx`select set_config('app.org_id', ${o.orgId}, true)`;
			return fn(tx);
		}) as Promise<T>;
	const state = async () =>
		(
			await inOrg(
				(tx) =>
					tx`select * from sso_provider_states where provider_id = ${o.providerId}`,
			)
		)[0] as Record<string, unknown> | undefined;
	const notes = async (key: string) =>
		inOrg(
			(tx) =>
				tx`select id, kind from notifications where payload->>'dedupeKey' like ${`${key}%`}`,
		);

	beforeAll(async () => {
		setKmsForTests(new LocalKms(new Map([[1, new Uint8Array(32)]]), 1));
		keysA = testIdpKeys();
		keysB = testIdpKeys();
		const { samlRegistration } = await import("@/lib/auth/sso-saml");
		const { certificateInfo, fingerprintSet } = await import(
			"@/lib/auth/saml-metadata"
		);
		const [owner] = await client`
			insert into "user" (name, email, email_verified, created_at, updated_at)
			values ('Inhaberin', ${`owner-${stamp}@example.org`}, true, now(), now())
			returning id`;
		const [org] = await client`
			insert into organization (name, slug, created_at)
			values ('Meta', ${`meta-${stamp}`}, now()) returning id`;
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
		const cfg = {
			issuer: idpEntityId,
			...samlRegistration({
				origin,
				providerId: o.providerId,
				idpEntityId,
				metadataXml: metadata(keysA),
			}),
		};
		await client`insert into sso_provider (id, issuer, saml_config, user_id, provider_id, organization_id, domain, domain_verified)
			values (${crypto.randomUUID()}, ${idpEntityId}, ${JSON.stringify(cfg)}, ${o.owner}, ${o.providerId}, ${o.orgId}, ${o.domain}, true)`;
		const certA = certificateInfo(keysA.cert);
		await inOrg(
			(
				tx,
			) => tx`insert into sso_provider_states (organization_id, provider_id, vendor, metadata_url, cert_fingerprints, cert_not_after)
				values (${o.orgId}, ${o.providerId}, 'other', ${metaUrl}, ${fingerprintSet(certA ? [certA] : [])}, ${certA?.notAfter ?? null})`,
		);
	});

	afterAll(async () => {
		setKmsForTests(null);
		await client`delete from sso_provider where organization_id = ${o.orgId}`;
		await client.begin(async (tx) => {
			await tx`select set_config('app.scope', 'platform', true)`;
			await tx`delete from organization where id = ${o.orgId}`;
		});
		await client`delete from "user" where email like ${`%${stamp}%`}`;
		await client.end({ timeout: 5 });
	});

	it("gleiches Zertifikat: nichts vorgemerkt", async () => {
		const { runSsoMetadata } = await import("@/lib/jobs/sso-metadata");
		served = metadata(keysA);
		await runSsoMetadata(new Date(), fetcher);
		const s = await state();
		expect(s?.next_cert_fingerprints).toBeNull();
		expect(s?.last_fetch_at).toBeTruthy();
	});

	it("neues Zertifikat: vorgemerkt, einmal gemeldet, nicht übernommen", async () => {
		const { runSsoMetadata } = await import("@/lib/jobs/sso-metadata");
		served = metadata(keysB);
		await runSsoMetadata(new Date(), fetcher);
		await runSsoMetadata(new Date(), fetcher);
		const s = await state();
		expect(s?.next_cert_fingerprints).toBeTruthy();
		expect(s?.next_cert_fingerprints).not.toBe(s?.cert_fingerprints);
		expect(await notes(`sso-next-cert:${o.providerId}`)).toHaveLength(1);
		const [p] =
			await client`select saml_config from sso_provider where provider_id = ${o.providerId}`;
		expect(String(p?.saml_config)).toContain(b64(keysA.cert).slice(0, 40));
	});

	it("Übernahme: veraltet, andere Entity-ID, dann richtig", async () => {
		const { adoptNextMetadata } = await import("@/lib/auth/sso-setup-service");
		const { withOrg } = await import("@/lib/db/with-org");
		const s = await state();
		const next = String(s?.next_cert_fingerprints);
		const current = String(s?.cert_fingerprints);
		const ctx = { orgId: o.orgId, userId: o.owner };
		// Stand hat sich geändert
		expect(
			await withOrg(ctx, (tx) =>
				adoptNextMetadata(tx, o.orgId, {
					providerId: o.providerId,
					next,
					current: "anderes",
				}),
			),
		).toBe("four_eyes_stale");
		// vorgemerkte Metadaten beschreiben einen anderen Anbieter
		await inOrg(
			(tx) =>
				tx`update sso_provider_states set next_metadata = ${metadata(keysB, "https://boese.example/idp")} where provider_id = ${o.providerId}`,
		);
		expect(
			await withOrg(ctx, (tx) =>
				adoptNextMetadata(tx, o.orgId, {
					providerId: o.providerId,
					next,
					current,
				}),
			),
		).toBe("sso_cert_entity_changed");
		await inOrg(
			(tx) =>
				tx`update sso_provider_states set next_metadata = ${metadata(keysB)} where provider_id = ${o.providerId}`,
		);
		expect(
			await withOrg(ctx, (tx) =>
				adoptNextMetadata(tx, o.orgId, {
					providerId: o.providerId,
					next,
					current,
				}),
			),
		).toBeNull();
		const after = await state();
		expect(after?.cert_fingerprints).toBe(next);
		expect(after?.next_cert_fingerprints).toBeNull();
	});

	it("nach der Übernahme klappt die Anmeldung mit dem neuen Schlüssel", async () => {
		const { auth } = await import("@/lib/auth/server");
		const { authnRequestId } = await import("@/lib/auth/saml-metadata");
		const { samlAcsUrl, samlSpEntityId } = await import("@/lib/auth/sso-saml");
		const r = await auth.api.signInSSO({
			body: { providerId: o.providerId, callbackURL: "/heute" },
		});
		const acs = samlAcsUrl(origin, o.providerId);
		const saml = (keys: IdpKeys) =>
			samlResponse({
				keys,
				idpEntityId,
				audience: samlSpEntityId(origin, o.providerId),
				acsUrl: acs,
				inResponseTo: authnRequestId(r.url, inflateRawSync),
				email: `person-${stamp}@${o.domain}`,
			});
		const post = async (body: string) => {
			const res = await auth.handler(
				new Request(acs, {
					method: "POST",
					headers: { "content-type": "application/x-www-form-urlencoded" },
					body: new URLSearchParams({
						SAMLResponse: body,
						RelayState: new URL(r.url).searchParams.get("RelayState") ?? "",
					}),
				}),
			);
			return (res.headers.get("set-cookie") ?? "").includes("session_token");
		};
		// mit dem alten Schlüssel nicht mehr
		expect(await post(saml(keysA))).toBe(false);
		const r2 = await auth.api.signInSSO({
			body: { providerId: o.providerId, callbackURL: "/heute" },
		});
		const ok = await auth.handler(
			new Request(acs, {
				method: "POST",
				headers: { "content-type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					SAMLResponse: samlResponse({
						keys: keysB,
						idpEntityId,
						audience: samlSpEntityId(origin, o.providerId),
						acsUrl: acs,
						inResponseTo: authnRequestId(r2.url, inflateRawSync),
						email: `person2-${stamp}@${o.domain}`,
					}),
					RelayState: new URL(r2.url).searchParams.get("RelayState") ?? "",
				}),
			}),
		);
		expect(ok.headers.get("set-cookie") ?? "").toContain("session_token");
	});

	it("Ablauf in 7 Tagen: eine Erinnerung", async () => {
		const { runSsoMetadata } = await import("@/lib/jobs/sso-metadata");
		const soon = new Date(Date.now() + 5 * 86_400_000);
		await inOrg(
			(tx) =>
				tx`update sso_provider_states set cert_not_after = ${soon}, metadata_url = null where provider_id = ${o.providerId}`,
		);
		await runSsoMetadata(new Date(), fetcher);
		await runSsoMetadata(new Date(), fetcher);
		const n = await notes(`sso-cert:${o.providerId}:7:${soon.toISOString()}`);
		expect(n).toHaveLength(1);
		expect(n[0]?.kind).toBe("security_alert");
	});
});
