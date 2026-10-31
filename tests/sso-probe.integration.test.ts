import { inflateRawSync } from "node:zlib";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { globalDb } from "@/db";
import { account, user } from "@/db/auth-schema";
import { generateDek, wrapDek } from "@/lib/crypto/envelope";
import { LocalKms, setKmsForTests } from "@/lib/crypto/kms";
import {
	type IdpKeys,
	type ResponseOptions,
	samlResponse,
	testIdpKeys,
} from "./helpers/saml-idp";

// Integrationstest (DATABASE_URL_TEST): Probe-Anmeldung (AP10b) gegen den
// echten ACS-Endpunkt mit eigenem IdP. Die Probe hält fest, was ankam, und
// legt weder Konto noch Verknüpfung noch Sitzung an; eine normale Anmeldung
// läuft wie bisher.

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

d("SSO-Probe: nichts anlegen, Ergebnis festhalten (Postgres)", () => {
	const client = postgres(url ?? "postgres://invalid", { max: 1 });
	const stamp = Date.now();
	const origin = new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000")
		.origin;
	let keys: IdpKeys;
	let auth: typeof import("@/lib/auth/server").auth;
	let probePath: (id: string) => string;
	let authnRequestId: typeof import("@/lib/auth/saml-metadata").authnRequestId;
	const idpEntityId = `https://idp.example.org/probe-${stamp}`;
	const o = {
		orgId: "",
		owner: "",
		providerId: `saml-probe-${stamp}`,
		domain: `probe-${stamp}.test`,
		spEntityId: "",
		acs: "",
	};

	beforeAll(async () => {
		setKmsForTests(new LocalKms(new Map([[1, new Uint8Array(32)]]), 1));
		keys = testIdpKeys();
		({ auth } = await import("@/lib/auth/server"));
		({ probePath } = await import("@/lib/auth/sso-probe"));
		({ authnRequestId } = await import("@/lib/auth/saml-metadata"));
		const { samlRegistration, samlSpEntityId, samlAcsUrl } = await import(
			"@/lib/auth/sso-saml"
		);
		const [owner] = await client`
			insert into "user" (name, email, email_verified, created_at, updated_at)
			values ('Inhaberin', ${`owner-${stamp}@example.org`}, true, now(), now())
			returning id`;
		const [org] = await client`
			insert into organization (name, slug, created_at)
			values ('Probe', ${`probe-${stamp}`}, now()) returning id`;
		const wrapped = await wrapDek(await generateDek());
		await client.begin(async (tx) => {
			await tx`select set_config('app.org_id', ${org?.id}, true)`;
			await tx`insert into org_settings (organization_id, encrypted_dek, key_version, sector)
				values (${org?.id}, ${wrapped.wrapped}, ${wrapped.keyVersion}, 'other')`;
		});
		await client`insert into member (organization_id, user_id, role, created_at)
			values (${org?.id}, ${owner?.id}, 'owner', now())`;
		const cfg = {
			issuer: idpEntityId,
			...samlRegistration({
				origin,
				providerId: o.providerId,
				idpEntityId,
				ssoUrl: `https://idp.example.org/probe-${stamp}/sso`,
				certificate: keys.cert,
			}),
		};
		await client`insert into sso_provider (id, issuer, saml_config, user_id, provider_id, organization_id, domain, domain_verified)
			values (${crypto.randomUUID()}, ${idpEntityId}, ${JSON.stringify(cfg)}, ${owner?.id}, ${o.providerId}, ${org?.id}, ${o.domain}, true)`;
		o.orgId = org?.id;
		o.owner = owner?.id;
		o.spEntityId = samlSpEntityId(origin, o.providerId);
		o.acs = samlAcsUrl(origin, o.providerId);
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

	// wie startSsoProbe: eigene Anfrage, Probe mit deren ID merken
	const startProbe = async () => {
		const probeId = crypto.randomUUID();
		const path = probePath(probeId);
		const r = await auth.api.signInSSO({
			body: {
				providerId: o.providerId,
				callbackURL: path,
				errorCallbackURL: path,
			},
		});
		const requestId = authnRequestId(r.url, inflateRawSync) ?? "";
		await client.begin(async (tx) => {
			await tx`select set_config('app.org_id', ${o.orgId}, true)`;
			await tx`insert into sso_probes (id, organization_id, provider_id, request_id, requested_by, expires_at)
				values (${probeId}, ${o.orgId}, ${o.providerId}, ${requestId}, ${o.owner}, now() + interval '10 minutes')`;
		});
		return {
			probeId,
			requestId,
			relayState: new URL(r.url).searchParams.get("RelayState") ?? "",
		};
	};
	const startLogin = async () => {
		const r = await auth.api.signInSSO({
			body: { providerId: o.providerId, callbackURL: "/heute" },
		});
		return {
			requestId: authnRequestId(r.url, inflateRawSync) ?? "",
			relayState: new URL(r.url).searchParams.get("RelayState") ?? "",
		};
	};
	const post = async (saml: string, relayState: string) => {
		const res = await auth.handler(
			new Request(o.acs, {
				method: "POST",
				headers: { "content-type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					SAMLResponse: saml,
					RelayState: relayState,
				}),
			}),
		);
		return {
			location: res.headers.get("location") ?? `status ${res.status}`,
			session: (res.headers.get("set-cookie") ?? "").includes("session_token"),
		};
	};
	const base = (over: Partial<ResponseOptions>): ResponseOptions => ({
		keys,
		idpEntityId,
		audience: o.spEntityId,
		acsUrl: o.acs,
		inResponseTo: null,
		email: `person-${crypto.randomUUID().slice(0, 8)}@${o.domain}`,
		...over,
	});
	const probeRow = async (id: string) => {
		const rows = await client.begin(async (tx) => {
			await tx`select set_config('app.org_id', ${o.orgId}, true)`;
			return tx`select finished_at, result from sso_probes where id = ${id}`;
		});
		return rows[0] as
			| { finished_at: Date | null; result: Record<string, unknown> | null }
			| undefined;
	};
	const userByEmail = async (email: string) =>
		(
			await globalDb
				.select({ id: user.id })
				.from(user)
				.where(eq(user.email, email))
				.limit(1)
		)[0];

	it("neue Adresse: kein Konto, keine Sitzung, Ergebnis gespeichert", async () => {
		const p = await startProbe();
		const opts = base({ inResponseTo: p.requestId });
		const r = await post(samlResponse(opts), p.relayState);
		expect(r.session).toBe(false);
		expect(r.location).toContain(`/einstellungen/sso/probe/${p.probeId}`);
		expect(r.location).toContain("SSO_PROBE_DONE");
		expect(await userByEmail(opts.email)).toBeUndefined();
		const row = await probeRow(p.probeId);
		expect(row?.finished_at).toBeTruthy();
		expect(row?.result).toMatchObject({
			ok: true,
			email: opts.email,
			domainOk: true,
			account: "new",
			role: "employee",
		});
		const state = await client.begin(async (tx) => {
			await tx`select set_config('app.org_id', ${o.orgId}, true)`;
			return tx`select probe_ok_at from sso_provider_states where provider_id = ${o.providerId}`;
		});
		expect(state[0]?.probe_ok_at).toBeTruthy();
	});

	it("bestehendes Konto der Domain: keine Verknüpfung, keine Sitzung", async () => {
		const email = `mara-${stamp}@${o.domain}`;
		const [u] = await client`
			insert into "user" (name, email, email_verified, created_at, updated_at)
			values ('Mara', ${email}, true, now(), now()) returning id`;
		const p = await startProbe();
		const r = await post(
			samlResponse(base({ inResponseTo: p.requestId, email })),
			p.relayState,
		);
		expect(r.session).toBe(false);
		const linked = await globalDb
			.select({ id: account.id })
			.from(account)
			.where(eq(account.userId, u?.id));
		expect(linked).toHaveLength(0);
		expect((await probeRow(p.probeId))?.result).toMatchObject({
			ok: true,
			account: "existing_no_org",
		});
	});

	it("fremde Domain: Probe zeigt den Grund", async () => {
		const p = await startProbe();
		const email = `chef-${stamp}@andere-${stamp}.test`;
		const r = await post(
			samlResponse(base({ inResponseTo: p.requestId, email })),
			p.relayState,
		);
		expect(r.session).toBe(false);
		expect(await userByEmail(email)).toBeUndefined();
		expect((await probeRow(p.probeId))?.result).toMatchObject({
			ok: false,
			error: "domain",
			domainOk: false,
		});
	});

	it("SHA-1: zurück zur Probe mit Grund", async () => {
		const p = await startProbe();
		const r = await post(
			samlResponse(base({ inResponseTo: p.requestId, alg: "sha1" })),
			p.relayState,
		);
		expect(r.session).toBe(false);
		expect(r.location).toContain(
			`/einstellungen/sso/probe/${p.probeId}?error=algorithm`,
		);
		expect((await probeRow(p.probeId))?.result).toMatchObject({
			ok: false,
			error: "algorithm",
		});
	});

	it("falsche Audience: Anmeldung abgelehnt, Probe-Seite bekommt den Grund", async () => {
		const p = await startProbe();
		const r = await post(
			samlResponse(
				base({ inResponseTo: p.requestId, audience: "https://falsch.example" }),
			),
			p.relayState,
		);
		expect(r.session).toBe(false);
		expect(r.location).toContain(`/einstellungen/sso/probe/${p.probeId}`);
		expect(r.location).toContain("invalid_saml_response");
	});

	it("normale Anmeldung ohne Probe: Sitzung wie bisher", async () => {
		const s = await startLogin();
		const opts = base({ inResponseTo: s.requestId });
		const r = await post(samlResponse(opts), s.relayState);
		expect(r.session, r.location).toBe(true);
		expect(await userByEmail(opts.email)).toBeTruthy();
	});
});
