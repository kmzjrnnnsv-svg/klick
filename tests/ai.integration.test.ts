import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@/db";
import {
	aiCredentials,
	auditLog,
	evidence,
	orgSettings,
	securityChanges,
} from "@/db/schema";
import { storeCredential } from "@/lib/ai/credentials";
import type { AiTransport } from "@/lib/ai/http";
import { evidenceCompareInput } from "@/lib/ai/inputs";
import {
	AI_POLICY_OFF,
	type AiPolicy,
	aiPolicyOf,
	aiPolicyRelaxed,
} from "@/lib/ai/policy";
import { comparePrompt, helpPrompt } from "@/lib/ai/prompts";
import { runAi, setAiTransportForTests } from "@/lib/ai/service";
import type { OrgContext } from "@/lib/auth/guards";
import { generateDek, wrapDek } from "@/lib/crypto/envelope";
import { LocalKms, setKmsForTests } from "@/lib/crypto/kms";
import { setOrgAi } from "@/lib/db/org-accounts";
import { storeEncryptedEvidence } from "@/lib/evidence/store";
import { articlePlain, articlesFor, rankHelp } from "@/lib/help";
import {
	decideSecurityChange,
	requestApplyChange,
} from "@/lib/security-changes/service";

// Integrationstest (DATABASE_URL_TEST): KI mit eigenem Schlüssel (ADR-032).
// Schlüssel nur verschlüsselt; Einschalten erst mit der zweiten Person;
// Aufruf über einen nachgebauten Anbieter schwärzt und steht ohne Inhalt im
// Verlauf; Admin aus, streng geheim, fremde Org.

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

const KEY = "sk-ant-test-0123456789abcdef";

d("KI mit eigenem Schlüssel (Postgres)", () => {
	const client = postgres(url ?? "postgres://invalid", { max: 1 });
	const db = drizzle(client, { schema, casing: "snake_case" });
	const stamp = Date.now();
	let orgA = "";
	let orgB = "";
	const u = { o1: "", o2: "", admin: "" };
	let sent: { url: string; body: string }[] = [];

	const ctx = (userId: string, orgId: string) =>
		({
			userId,
			orgId,
			orgRole: "owner",
			grants: [],
			stepUpFresh: false,
			ip: null,
			userAgent: null,
		}) as unknown as OrgContext;
	const inOrg = <T>(
		orgId: string,
		fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
	) =>
		db.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
			return fn(tx);
		});
	const policyOf = (orgId: string) =>
		inOrg(orgId, async (tx) => {
			const [r] = await tx
				.select({ p: orgSettings.aiPolicy })
				.from(orgSettings)
				.where(eq(orgSettings.organizationId, orgId));
			return aiPolicyOf(r?.p);
		});
	const fake: AiTransport = async (_p, req) => {
		sent.push({ url: req.url, body: JSON.stringify(req.body) });
		return {
			ok: true,
			res: {
				status: 200,
				body: JSON.stringify({
					content: [{ type: "text", text: "Neu ist Abschnitt 2." }],
					usage: { input_tokens: 12, output_tokens: 6 },
				}),
			},
		};
	};

	beforeAll(async () => {
		setKmsForTests(new LocalKms(new Map([[1, new Uint8Array(32)]]), 1));
		setAiTransportForTests(fake);
		for (const key of Object.keys(u) as (keyof typeof u)[]) {
			const [row] = await client`
				insert into "user" (name, email, email_verified, created_at, updated_at)
				values (${key}, ${`ai-${key}-${stamp}@example.org`}, true, now(), now())
				returning id`;
			u[key] = row?.id;
		}
		for (const name of ["A", "B"]) {
			const wrapped = await wrapDek(await generateDek());
			const [org] = await client`
				insert into organization (name, slug, created_at)
				values (${`KI ${name}`}, ${`ai-${name.toLowerCase()}-${stamp}`}, now()) returning id`;
			await client.begin(async (tx) => {
				await tx`select set_config('app.org_id', ${org?.id}, true)`;
				await tx`insert into org_settings (organization_id, encrypted_dek, key_version, sector)
					values (${org?.id}, ${wrapped.wrapped}, ${wrapped.keyVersion}, 'other')`;
			});
			if (name === "A") orgA = org?.id;
			else orgB = org?.id;
		}
		await client`insert into member (organization_id, user_id, role, created_at) values
			(${orgA}, ${u.o1}, 'owner', now() - interval '2 days'),
			(${orgA}, ${u.o2}, 'owner', now() - interval '2 days')`;
	});

	afterAll(async () => {
		setKmsForTests(null);
		setAiTransportForTests(null);
		await client`delete from platform_org_accounts where org_id in (${orgA}, ${orgB})`;
		await client`delete from organization where id in (${orgA}, ${orgB})`;
		await client`delete from "user" where id in ${client(Object.values(u))}`;
		await client.end();
	});

	let credentialId = "";
	let enabled: AiPolicy;

	it("Schlüssel nur verschlüsselt, fremde Org sieht ihn nicht", async () => {
		const info = await inOrg(orgA, (tx) =>
			storeCredential(tx, orgA, {
				provider: "anthropic",
				key: KEY,
				userId: u.o1,
			}),
		);
		credentialId = info.id;
		expect(info.keyHint).toBe("…cdef");
		const [row] = await inOrg(orgA, (tx) =>
			tx.select().from(aiCredentials).where(eq(aiCredentials.id, credentialId)),
		);
		expect(row?.keyEnc.startsWith("enc1:")).toBe(true);
		expect(row?.keyEnc).not.toContain(KEY);
		expect(
			await inOrg(orgB, (tx) =>
				tx
					.select()
					.from(aiCredentials)
					.where(eq(aiCredentials.id, credentialId)),
			),
		).toEqual([]);
	});

	it("Einschalten wirkt erst mit der zweiten Person", async () => {
		enabled = {
			...AI_POLICY_OFF,
			enabled: true,
			maxClass: "internal",
			features: ["compare"],
			provider: "anthropic",
			model: "claude-sonnet-5-5",
			credentialId,
			dpaConfirmedAt: new Date().toISOString(),
			dpaConfirmedBy: u.o1,
		};
		const before = await policyOf(orgA);
		expect(aiPolicyRelaxed(before, enabled)).toContain("enabled");
		expect(
			await requestApplyChange(ctx(u.o1, orgA), {
				kind: "ai_policy",
				targetKey: null,
				summary: "KI einschalten",
				payload: { value: enabled },
				before: {},
			}),
		).toEqual({ ok: false, error: "four_eyes_requested" });
		expect((await policyOf(orgA)).enabled).toBe(false);
		const [open] = await inOrg(orgA, (tx) =>
			tx
				.select()
				.from(securityChanges)
				.where(
					and(
						eq(securityChanges.organizationId, orgA),
						eq(securityChanges.kind, "ai_policy"),
					),
				),
		);
		expect(JSON.stringify(open?.payload)).not.toContain(KEY);
		expect(
			await decideSecurityChange(ctx(u.o2, orgA), {
				id: open?.id ?? "",
				approve: true,
				note: null,
			}),
		).toMatchObject({ ok: true });
		expect((await policyOf(orgA)).enabled).toBe(true);
	});

	it("ohne Freischaltung durch Klick geht nichts raus", async () => {
		sent = [];
		const r = await runAi(ctx(u.o1, orgA), {
			feature: "compare",
			classification: "internal",
			target: "document:x",
			system: "Vergleiche.",
			messages: [{ role: "user", content: "Text" }],
		});
		expect(r).toEqual({ ok: false, error: "ai_off_admin" });
		expect(sent).toEqual([]);
	});

	it("Aufruf: geschwärzt, Antwort als Text, Verlauf ohne Inhalt", async () => {
		await setOrgAi({ userId: u.admin, ip: null, userAgent: null }, orgA, {
			aiEnabled: true,
			aiMode: "assist",
			aiMaxClass: "confidential",
		});
		sent = [];
		const r = await runAi(ctx(u.o1, orgA), {
			feature: "compare",
			classification: "internal",
			target: "document:abc",
			system: "Vergleiche zwei Fassungen.",
			messages: [
				{
					role: "user",
					content:
						"Kontakt max.muster@beispiel.de, IBAN DE89 3704 0044 0532 0130 00",
				},
			],
		});
		expect(r).toEqual({
			ok: true,
			data: {
				text: "Neu ist Abschnitt 2.",
				provider: "anthropic",
				model: "claude-sonnet-5-5",
				redacted: 2,
			},
		});
		expect(sent).toHaveLength(1);
		expect(sent[0]?.body).toContain("[E-Mail entfernt]");
		expect(sent[0]?.body).not.toMatch(/max\.muster|DE89/);
		const [entry] = await inOrg(orgA, (tx) =>
			tx
				.select()
				.from(auditLog)
				.where(
					and(
						eq(auditLog.organizationId, orgA),
						eq(auditLog.action, "ai.request"),
					),
				),
		);
		const logged = JSON.stringify(entry?.after);
		expect(logged).toContain('"outcome":"ok"');
		expect(logged).toContain('"email":1');
		expect(logged).not.toMatch(/max\.muster|DE89|Abschnitt|Vergleiche/);
		// Freischaltung steht in der Kette der Org
		const [granted] = await inOrg(orgA, (tx) =>
			tx
				.select()
				.from(auditLog)
				.where(
					and(
						eq(auditLog.organizationId, orgA),
						eq(auditLog.action, "platform.ai_settings"),
					),
				),
		);
		expect(granted).toBeDefined();
	});

	it("über der Einstufung oder streng geheim: nichts raus", async () => {
		sent = [];
		const base = {
			feature: "compare" as const,
			target: "document:y",
			system: "x",
			messages: [{ role: "user" as const, content: "y" }],
		};
		expect(
			await runAi(ctx(u.o1, orgA), { ...base, classification: "confidential" }),
		).toEqual({ ok: false, error: "ai_class_too_high" });
		expect(
			await runAi(ctx(u.o1, orgA), { ...base, classification: "secret" }),
		).toEqual({ ok: false, error: "ai_secret_never" });
		expect(
			await runAi(ctx(u.o1, orgA), {
				...base,
				feature: "draft",
				classification: "internal",
			}),
		).toEqual({ ok: false, error: "ai_feature_off" });
		expect(sent).toEqual([]);
	});

	it("Nachweis-Vergleich: nur Änderungen, geschwärzt; Prüfer-Sicht und vertraulich", async () => {
		const store = (text: string) =>
			inOrg(
				orgA,
				async (tx) =>
					(
						await storeEncryptedEvidence(tx, {
							orgId: orgA,
							bytes: new TextEncoder().encode(text),
							mime: "text/plain",
							safeName: "notfallplan.txt",
							title: "Notfallplan",
							type: "document",
							classification: "internal",
							createdByUserId: null,
							text: { status: "ok", text, truncated: false },
						})
					).id,
			);
		const v1 = await store(
			"Notfallplan\nKontakt max.muster@beispiel.de\nÜbung alle zwei Jahre",
		);
		const v2 = await store(
			"Notfallplan\nKontakt max.muster@beispiel.de\nÜbung jährlich",
		);
		await inOrg(orgA, async (tx) => {
			await tx
				.update(evidence)
				.set({ supersedesId: v1 })
				.where(eq(evidence.id, v2));
			await tx
				.update(evidence)
				.set({ supersededAt: new Date(), supersededById: v2 })
				.where(eq(evidence.id, v1));
		});
		const owner = ctx(u.o1, orgA);
		const loaded = await inOrg(orgA, (tx) =>
			evidenceCompareInput(tx, owner, v2, false),
		);
		if (!loaded.ok) throw new Error(loaded.error);
		expect([loaded.diff.added, loaded.diff.removed]).toEqual([1, 1]);
		sent = [];
		const p = comparePrompt({ ...loaded, withFiles: false });
		const r = await runAi(owner, {
			feature: "compare",
			classification: loaded.classification,
			target: loaded.target,
			system: p.system,
			messages: [{ role: "user", content: p.user }],
		});
		expect(r.ok).toBe(true);
		expect(sent[0]?.body).toContain("Übung jährlich");
		expect(sent[0]?.body).not.toContain("max.muster");
		// Prüfer:in ohne „Entwürfe und Verlauf“: keine ersetzte Fassung
		const auditor = { ...owner, orgRole: "auditor" } as OrgContext;
		expect(
			await inOrg(orgA, (tx) => evidenceCompareInput(tx, auditor, v2, false)),
		).toEqual({ ok: false, error: "forbidden" });
		// vertraulich: erst nach frischer Bestätigung, dann greift die
		// Obergrenze der Org (intern)
		await inOrg(orgA, (tx) =>
			tx
				.update(evidence)
				.set({ classification: "confidential" })
				.where(eq(evidence.id, v2)),
		);
		expect(
			await inOrg(orgA, (tx) => evidenceCompareInput(tx, owner, v2, false)),
		).toEqual({ ok: false, error: "step_up_required" });
		const fresh = { ...owner, stepUpFresh: true } as OrgContext;
		const again = await inOrg(orgA, (tx) =>
			evidenceCompareInput(tx, fresh, v2, false),
		);
		if (!again.ok) throw new Error(again.error);
		expect(again.classification).toBe("confidential");
		sent = [];
		expect(
			await runAi(fresh, {
				feature: "compare",
				classification: again.classification,
				target: again.target,
				system: "x",
				messages: [{ role: "user", content: "y" }],
			}),
		).toEqual({ ok: false, error: "ai_class_too_high" });
		expect(sent).toEqual([]);
	}, 60_000);

	it("Hilfe-Frage: nur Hilfetexte gehen raus", async () => {
		await inOrg(orgA, (tx) =>
			tx
				.update(orgSettings)
				.set({ aiPolicy: { ...enabled, features: ["compare", "help"] } })
				.where(eq(orgSettings.organizationId, orgA)),
		);
		const question = "Wie lade ich eine neue Fassung eines Nachweises hoch?";
		const articles = rankHelp(articlesFor("owner"), question);
		const p = helpPrompt({
			question,
			articles: articles.map((a) => ({
				title: a.title,
				text: articlePlain(a),
			})),
		});
		sent = [];
		const r = await runAi(ctx(u.o1, orgA), {
			feature: "help",
			classification: null,
			target: "help",
			system: p.system,
			messages: [{ role: "user", content: p.user }],
		});
		expect(r.ok).toBe(true);
		expect(sent[0]?.body).toContain("Nachweise: hochladen");
	});

	it("fremde Org: eigene Regel aus, kein Schlüssel", async () => {
		expect((await policyOf(orgB)).enabled).toBe(false);
		const r = await runAi(ctx(u.o1, orgB), {
			feature: "help",
			classification: null,
			target: "help",
			system: "x",
			messages: [{ role: "user", content: "y" }],
		});
		expect(r).toEqual({ ok: false, error: "ai_off_admin" });
	});
});
