import { and, eq } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { globalDb } from "@/db";
import { member, user } from "@/db/auth-schema";
import { generateDek, wrapDek } from "@/lib/crypto/envelope";
import { LocalKms, setKmsForTests } from "@/lib/crypto/kms";
import {
	authnRequestId,
	type IdpKeys,
	type ResponseOptions,
	samlResponse,
	testIdpKeys,
} from "./helpers/saml-idp";

// Integrationstest (DATABASE_URL_TEST): SSO absichern (Härtung A7) mit
// eigenem IdP gegen den echten ACS-Endpunkt. Angenommen wird nur eine von
// diesem IdP signierte Assertion zu einer eigenen Anfrage, für genau diesen
// Anbieter und eine Adresse seiner bestätigten Domain. Abgelehnt: fremde
// Domain, Wiederholung, IdP-initiiert, ohne Signatur, nur Response signiert,
// SHA-1, falsche Audience, Assertion von Anbieter A an der ACS von B,
// abgelaufen.

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

d("SSO mit SAML: nur die eigene, signierte Antwort (Postgres)", () => {
	const client = postgres(url ?? "postgres://invalid", { max: 1 });
	const stamp = Date.now();
	const origin = new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000")
		.origin;
	let keys: IdpKeys;
	let auth: typeof import("@/lib/auth/server").auth;
	const idpEntityId = `https://idp.example.org/${stamp}`;
	type Org = {
		id: string;
		owner: string;
		providerId: string;
		domain: string;
		spEntityId: string;
		acs: string;
	};
	const orgs: Record<"a" | "b", Org> = {
		a: {} as Org,
		b: {} as Org,
	};

	beforeAll(async () => {
		setKmsForTests(new LocalKms(new Map([[1, new Uint8Array(32)]]), 1));
		keys = testIdpKeys();
		({ auth } = await import("@/lib/auth/server"));
		const { samlRegistration, samlSpEntityId, samlAcsUrl } = await import(
			"@/lib/auth/sso-saml"
		);
		for (const k of ["a", "b"] as const) {
			const [owner] = await client`
				insert into "user" (name, email, email_verified, created_at, updated_at)
				values (${`Owner ${k}`}, ${`owner-${k}-${stamp}@example.org`}, true, now(), now())
				returning id`;
			const [org] = await client`
				insert into organization (name, slug, created_at)
				values (${`SAML ${k}`}, ${`saml-${k}-${stamp}`}, now()) returning id`;
			const wrapped = await wrapDek(await generateDek());
			await client.begin(async (tx) => {
				await tx`select set_config('app.org_id', ${org?.id}, true)`;
				await tx`insert into org_settings (organization_id, encrypted_dek, key_version, sector)
					values (${org?.id}, ${wrapped.wrapped}, ${wrapped.keyVersion}, 'other')`;
			});
			await client`insert into member (organization_id, user_id, role, created_at)
				values (${org?.id}, ${owner?.id}, 'owner', now())`;
			const providerId = `saml-${k}-${stamp}`;
			const domain = `firma-${k}-${stamp}.test`;
			// gespeichert wie vom Plugin (registerSSOProvider): issuer = IdP
			const cfg = {
				issuer: idpEntityId,
				...samlRegistration({
					origin,
					providerId,
					idpEntityId,
					ssoUrl: `https://idp.example.org/${stamp}/sso`,
					certificate: keys.cert,
				}),
			};
			await client`insert into sso_provider (id, issuer, saml_config, user_id, provider_id, organization_id, domain, domain_verified)
				values (${crypto.randomUUID()}, ${idpEntityId}, ${JSON.stringify(cfg)}, ${owner?.id}, ${providerId}, ${org?.id}, ${domain}, true)`;
			orgs[k] = {
				id: org?.id,
				owner: owner?.id,
				providerId,
				domain,
				spEntityId: samlSpEntityId(origin, providerId),
				acs: samlAcsUrl(origin, providerId),
			};
		}
	});

	afterAll(async () => {
		setKmsForTests(null);
		const ids = [orgs.a.id, orgs.b.id].filter(Boolean);
		await client`delete from sso_provider where organization_id in ${client(ids)}`;
		await client.begin(async (tx) => {
			await tx`select set_config('app.scope', 'platform', true)`;
			await tx`delete from organization where id in ${client(ids)}`;
		});
		await client`delete from "user" where email like ${`%${stamp}%`}`;
		await client.end({ timeout: 5 });
	});

	// SP-initiiert: Anfrage bei Klick, ID und RelayState für die Antwort
	const start = async (o: Org) => {
		const r = await auth.api.signInSSO({
			body: { providerId: o.providerId, callbackURL: "/heute" },
		});
		return {
			requestId: authnRequestId(r.url),
			relayState: new URL(r.url).searchParams.get("RelayState") ?? "",
		};
	};
	const post = async (
		acs: string,
		saml: string,
		relayState: string,
	): Promise<{ location: string; session: boolean }> => {
		const res = await auth.handler(
			new Request(acs, {
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
	const base = (o: Org, over: Partial<ResponseOptions> = {}) => ({
		keys,
		idpEntityId,
		audience: o.spEntityId,
		acsUrl: o.acs,
		inResponseTo: null,
		email: `person-${crypto.randomUUID().slice(0, 8)}@${o.domain}`,
		...over,
	});
	const userByEmail = async (email: string) =>
		(
			await globalDb
				.select({ id: user.id })
				.from(user)
				.where(eq(user.email, email))
				.limit(1)
		)[0];

	it("eigene, signierte Antwort: Sitzung und Mitglied der Org", async () => {
		const { requestId, relayState } = await start(orgs.a);
		const opts = base(orgs.a, { inResponseTo: requestId });
		const saml = samlResponse(opts);
		const ok = await post(orgs.a.acs, saml, relayState);
		expect(ok.session, ok.location).toBe(true);
		const u = await userByEmail(opts.email);
		expect(u).toBeTruthy();
		const m = await globalDb
			.select({ role: member.role })
			.from(member)
			.where(
				and(
					eq(member.userId, u?.id ?? ""),
					eq(member.organizationId, orgs.a.id),
				),
			);
		expect(m).toHaveLength(1);
		// dieselbe Antwort noch einmal: abgelehnt (Wiederholung)
		const again = await post(orgs.a.acs, saml, relayState);
		expect(again.session).toBe(false);
	});

	it("fremde Domain: kein Konto, keine Sitzung", async () => {
		const { requestId, relayState } = await start(orgs.a);
		const email = `chefin-${stamp}@${orgs.b.domain}`;
		const r = await post(
			orgs.a.acs,
			samlResponse(base(orgs.a, { inResponseTo: requestId, email })),
			relayState,
		);
		expect(r.session).toBe(false);
		expect(await userByEmail(email)).toBeUndefined();
	});

	it.each([
		["IdP-initiiert (ohne InResponseTo)", { inResponseTo: null }],
		["ohne Signatur", { sign: "none" }],
		["nur die Response signiert", { sign: "response" }],
		["SHA-1", { alg: "sha1" }],
		["abgelaufen", { notBefore: -20 * 60_000, notOnOrAfter: -10 * 60_000 }],
	] as const)("abgelehnt: %s", async (_name, over) => {
		const { requestId, relayState } = await start(orgs.a);
		const opts = base(orgs.a, { inResponseTo: requestId, ...over });
		const r = await post(orgs.a.acs, samlResponse(opts), relayState);
		expect(r.session, r.location).toBe(false);
		expect(await userByEmail(opts.email)).toBeUndefined();
	});

	it("Signatur-Wrapping: zweite, unsignierte Assertion mit fremder Adresse", async () => {
		const { requestId, relayState } = await start(orgs.a);
		const evil = `boss-${stamp}@${orgs.a.domain}`;
		const opts = base(orgs.a, {
			inResponseTo: requestId,
			// die signierte Assertion bleibt, davor eine Kopie ohne Signatur
			// mit anderer Adresse (XSW)
			mutate: (xml) => {
				const start = xml.indexOf("<saml:Assertion");
				const end =
					xml.indexOf("</saml:Assertion>") + "</saml:Assertion>".length;
				const copy = xml
					.slice(start, end)
					.replace(/<ds:Signature[\s\S]*?<\/ds:Signature>/, "")
					.replace(/ID="_[0-9a-f]+"/, 'ID="_evil"')
					.replaceAll(/person-[0-9a-f]+@[^<"]+/g, evil);
				return xml.slice(0, start) + copy + xml.slice(start);
			},
		});
		const r = await post(orgs.a.acs, samlResponse(opts), relayState);
		expect(r.session).toBe(false);
		expect(await userByEmail(evil)).toBeUndefined();
	});

	it("falsche Audience (Entity-ID eines anderen Anbieters)", async () => {
		const { requestId, relayState } = await start(orgs.a);
		const opts = base(orgs.a, {
			inResponseTo: requestId,
			audience: orgs.b.spEntityId,
		});
		const r = await post(orgs.a.acs, samlResponse(opts), relayState);
		expect(r.session).toBe(false);
	});

	it("Assertion für Anbieter A an der ACS von B (gleicher IdP)", async () => {
		const { requestId, relayState } = await start(orgs.b);
		// Antwort an A gerichtet, aber mit der Anfrage von B an Bs ACS
		const opts = base(orgs.a, {
			inResponseTo: requestId,
			email: `x-${stamp}@${orgs.b.domain}`,
		});
		const r = await post(orgs.b.acs, samlResponse(opts), relayState);
		expect(r.session).toBe(false);
		expect(await userByEmail(opts.email)).toBeUndefined();
	});
});
