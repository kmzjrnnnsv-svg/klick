import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@/db";
import {
	auditLog,
	notifications,
	orgSettings,
	securityChanges,
} from "@/db/schema";
import type { OrgContext } from "@/lib/auth/guards";
import { generateDek, wrapDek } from "@/lib/crypto/envelope";
import { LocalKms, setKmsForTests } from "@/lib/crypto/kms";
import { DEFAULT_DLP_POLICY } from "@/lib/dlp/policy";
import {
	applyDueChanges,
	cancelSecurityChange,
	checkPermit,
	decideSecurityChange,
	redeemPermit,
	requestApplyChange,
} from "@/lib/security-changes/service";

// Integrationstest (DATABASE_URL_TEST): Vier-Augen (Härtung A4). Antrag wirkt
// erst mit der zweiten Person; nie die eigene Änderung; veraltete Anträge
// verfallen; Erlaubnis gilt einmal und nur für die anfragende Person; ohne
// zweite Person 24 h Wartezeit, danach setzt der Job; Abbrechen.

const url = process.env.DATABASE_URL_TEST;
const d = url ? describe : describe.skip;

d("Vier-Augen für Sicherheitsänderungen (Postgres)", () => {
	const client = postgres(url ?? "postgres://invalid", { max: 1 });
	const db = drizzle(client, { schema, casing: "snake_case" });
	const stamp = Date.now();
	let orgA = "";
	let orgB = "";
	const u = { o1: "", o2: "", editor: "", solo: "" };

	const ctx = (
		userId: string,
		orgId: string,
		orgRole: OrgContext["orgRole"] = "owner",
	) => ({ userId, orgId, orgRole, ip: null, userAgent: null }) as OrgContext;
	const inOrg = <T>(
		orgId: string,
		fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
	) =>
		db.transaction(async (tx) => {
			await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
			return fn(tx);
		});
	const dlpOf = (orgId: string) =>
		inOrg(orgId, async (tx) => {
			const [r] = await tx
				.select({ dlp: orgSettings.dlpPolicy })
				.from(orgSettings)
				.where(eq(orgSettings.organizationId, orgId));
			return r?.dlp ?? null;
		});
	const rowsOf = (orgId: string) =>
		inOrg(orgId, (tx) =>
			tx
				.select()
				.from(securityChanges)
				.where(eq(securityChanges.organizationId, orgId)),
		);
	const relaxed = { ...DEFAULT_DLP_POLICY, pii: "allow" as const };
	const dlpChange = async (orgId: string) => ({
		kind: "dlp_policy" as const,
		targetKey: null,
		summary: "DLP lockern",
		payload: { value: relaxed },
		before: (await dlpOf(orgId)) as Record<string, unknown> | null,
	});

	beforeAll(async () => {
		setKmsForTests(new LocalKms(new Map([[1, new Uint8Array(32)]]), 1));
		for (const key of Object.keys(u) as (keyof typeof u)[]) {
			const [row] = await client`
				insert into "user" (name, email, email_verified, created_at, updated_at)
				values (${key}, ${`fe-${key}-${stamp}@example.org`}, true, now(), now())
				returning id`;
			u[key] = row?.id;
		}
		for (const name of ["A", "B"]) {
			const wrapped = await wrapDek(await generateDek());
			const [org] = await client`
				insert into organization (name, slug, created_at)
				values (${`Vier-Augen ${name}`}, ${`four-eyes-${name.toLowerCase()}-${stamp}`}, now()) returning id`;
			await client.begin(async (tx) => {
				await tx`select set_config('app.org_id', ${org?.id}, true)`;
				await tx`insert into org_settings (organization_id, encrypted_dek, key_version, sector)
					values (${org?.id}, ${wrapped.wrapped}, ${wrapped.keyVersion}, 'other')`;
			});
			if (name === "A") orgA = org?.id;
			else orgB = org?.id;
		}
		// Entscheider:innen zählen erst nach 24 h (eligibleDeciders)
		await client`insert into member (organization_id, user_id, role, created_at) values
			(${orgA}, ${u.o1}, 'owner', now() - interval '2 days'),
			(${orgA}, ${u.o2}, 'owner', now() - interval '2 days'),
			(${orgA}, ${u.editor}, 'editor', now() - interval '2 days'),
			(${orgB}, ${u.solo}, 'owner', now() - interval '2 days')`;
	});

	afterAll(async () => {
		setKmsForTests(null);
		await client`delete from organization where id in (${orgA}, ${orgB})`;
		await client`delete from "user" where id in ${client(Object.values(u))}`;
		await client.end();
	});

	it("wirkt erst mit der zweiten Person, nie die eigene Änderung", async () => {
		expect(
			await requestApplyChange(ctx(u.o1, orgA), await dlpChange(orgA)),
		).toEqual({
			ok: false,
			error: "four_eyes_requested",
		});
		// ein zweiter Antrag derselben Art wartet auf den ersten
		expect(
			await requestApplyChange(ctx(u.o2, orgA), await dlpChange(orgA)),
		).toEqual({
			ok: false,
			error: "four_eyes_pending",
		});
		expect(await dlpOf(orgA)).not.toMatchObject({ pii: "allow" });
		const [row] = await rowsOf(orgA);
		const notes = await inOrg(orgA, (tx) =>
			tx
				.select({ userId: notifications.userId })
				.from(notifications)
				.where(
					and(
						eq(notifications.organizationId, orgA),
						eq(notifications.kind, "security_change"),
					),
				),
		);
		expect(notes.map((n) => n.userId)).toEqual([u.o2]);

		const decide = (userId: string, role: OrgContext["orgRole"] = "owner") =>
			decideSecurityChange(ctx(userId, orgA, role), {
				id: row?.id ?? "",
				approve: true,
				note: null,
			});
		expect(await decide(u.o1)).toEqual({ ok: false, error: "four_eyes_self" });
		expect(await decide(u.editor, "editor")).toEqual({
			ok: false,
			error: "forbidden",
		});
		expect((await decide(u.o2)).ok).toBe(true);
		expect(await dlpOf(orgA)).toMatchObject({ pii: "allow" });
		expect((await rowsOf(orgA))[0]?.status).toBe("applied");
		const log = await inOrg(orgA, (tx) =>
			tx
				.select({ action: auditLog.action })
				.from(auditLog)
				.where(eq(auditLog.organizationId, orgA)),
		);
		expect(log.map((l) => l.action)).toEqual(
			expect.arrayContaining([
				"security_change.requested",
				"security_change.applied",
			]),
		);
	});

	it("veraltet: hat sich der Wert seither geändert, verfällt der Antrag", async () => {
		await requestApplyChange(ctx(u.o1, orgA), {
			...(await dlpChange(orgA)),
			payload: { value: { ...relaxed, secret: "warn" } },
		});
		await inOrg(orgA, (tx) =>
			tx
				.update(orgSettings)
				.set({ dlpPolicy: DEFAULT_DLP_POLICY })
				.where(eq(orgSettings.organizationId, orgA)),
		);
		const open = (await rowsOf(orgA)).find((r) => r.status === "pending");
		expect(
			await decideSecurityChange(ctx(u.o2, orgA), {
				id: open?.id ?? "",
				approve: true,
				note: null,
			}),
		).toEqual({ ok: false, error: "four_eyes_stale" });
		expect(await dlpOf(orgA)).toMatchObject({ secret: "block" });
		expect((await rowsOf(orgA)).find((r) => r.id === open?.id)?.status).toBe(
			"expired",
		);
	});

	it("Erlaubnis: nur für die anfragende Person und nur einmal", async () => {
		const input = {
			kind: "org_delete" as const,
			targetKey: null,
			summary: "Organisation löschen",
		};
		expect(await checkPermit(ctx(u.o1, orgA), input)).toEqual({
			ok: false,
			error: "four_eyes_requested",
		});
		expect(await checkPermit(ctx(u.o1, orgA), input)).toEqual({
			ok: false,
			error: "four_eyes_pending",
		});
		const row = (await rowsOf(orgA)).find((r) => r.kind === "org_delete");
		expect(
			(
				await decideSecurityChange(ctx(u.o2, orgA), {
					id: row?.id ?? "",
					approve: true,
					note: null,
				})
			).ok,
		).toBe(true);
		// die zweite Person selbst hat damit keine Erlaubnis
		expect(await checkPermit(ctx(u.o2, orgA), input)).toEqual({
			ok: false,
			error: "four_eyes_pending",
		});
		const p = await checkPermit(ctx(u.o1, orgA), input);
		expect(p.ok).toBe(true);
		const id = p.ok ? p.data.id : "";
		expect(await redeemPermit(ctx(u.o2, orgA), id)).toEqual({
			ok: false,
			error: "four_eyes_not_open",
		});
		expect((await redeemPermit(ctx(u.o1, orgA), id)).ok).toBe(true);
		expect(await redeemPermit(ctx(u.o1, orgA), id)).toEqual({
			ok: false,
			error: "four_eyes_not_open",
		});
	});

	it("ohne zweite Person: 24 h Wartezeit, dann setzt der Job", async () => {
		expect(
			await requestApplyChange(ctx(u.solo, orgB), await dlpChange(orgB)),
		).toEqual({
			ok: false,
			error: "four_eyes_waiting",
		});
		const now = new Date();
		expect(await inOrg(orgB, (tx) => applyDueChanges(tx, orgB, now))).toBe(0);
		await inOrg(orgB, (tx) =>
			tx
				.update(securityChanges)
				.set({ applyAfter: new Date(now.getTime() - 60_000) })
				.where(eq(securityChanges.organizationId, orgB)),
		);
		expect(await inOrg(orgB, (tx) => applyDueChanges(tx, orgB, now))).toBe(1);
		expect(await dlpOf(orgB)).toMatchObject({ pii: "allow" });

		// „erlaubt“ mit Wartezeit: erst nach Ablauf ausführbar
		const input = {
			kind: "full_export" as const,
			targetKey: null,
			summary: "Vollexport",
		};
		expect(await checkPermit(ctx(u.solo, orgB), input)).toEqual({
			ok: false,
			error: "four_eyes_waiting_permit",
		});
		expect(await checkPermit(ctx(u.solo, orgB), input)).toEqual({
			ok: false,
			error: "four_eyes_waiting_permit",
		});
		await inOrg(orgB, (tx) =>
			tx
				.update(securityChanges)
				.set({ applyAfter: new Date(Date.now() - 60_000) })
				.where(eq(securityChanges.kind, "full_export")),
		);
		expect((await checkPermit(ctx(u.solo, orgB), input)).ok).toBe(true);
	});

	it("eine eben hinzugekommene Inhaber:in zählt noch nicht", async () => {
		// orgB: zweite Inhaberin seit eben — die erste wartet trotzdem 24 h
		await client`insert into member (organization_id, user_id, role, created_at)
			values (${orgB}, ${u.editor}, 'owner', now())`;
		expect(
			await checkPermit(ctx(u.solo, orgB), {
				kind: "integration_token",
				targetKey: null,
				summary: "Token anlegen",
			}),
		).toEqual({ ok: false, error: "four_eyes_waiting_permit" });
		await client`delete from member where organization_id = ${orgB} and user_id = ${u.editor}`;
	});

	it("abbrechen: anfragende Person oder Entscheider:in", async () => {
		await checkPermit(ctx(u.o1, orgA), {
			kind: "integration_token",
			targetKey: null,
			summary: "Token anlegen",
		});
		const row = (await rowsOf(orgA)).find(
			(r) => r.kind === "integration_token",
		);
		expect(
			await cancelSecurityChange(ctx(u.editor, orgA, "editor"), row?.id ?? ""),
		).toEqual({ ok: false, error: "forbidden" });
		expect(
			(await cancelSecurityChange(ctx(u.o1, orgA), row?.id ?? "")).ok,
		).toBe(true);
		expect((await rowsOf(orgA)).find((r) => r.id === row?.id)?.status).toBe(
			"cancelled",
		);
	});
});
