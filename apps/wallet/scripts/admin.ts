/**
 * both.money am Terminal verwalten (Plattform, auditiert). Links erscheinen
 * nur hier — keine Mail, nichts im Journal.
 *
 *   pnpm wallet:admin org create --name "Raza" --slug raza [--operator]
 *   pnpm wallet:admin org list
 *   pnpm wallet:admin account create --email <adresse> --name "<Name>" [--org <slug>] [--role owner|operator|viewer] [--admin]
 *   pnpm wallet:admin account link --email <adresse>     (neuer Aktivierungslink, nur ohne Passkey)
 *   pnpm wallet:admin account list
 *   pnpm wallet:admin invite --org <slug> --email <adresse> [--role viewer]
 *   pnpm wallet:admin admin --email <adresse> [--revoke]
 *   pnpm wallet:recover <adresse>                       (Passkeys + Sitzungen weg, Link für neuen Passkey)
 */
import { readFileSync } from "node:fs";
import { db, sqlClient } from "@wallet/db";
import { passkey, session, user } from "@wallet/db/auth-schema";
import { members, orgSettings, orgs } from "@wallet/db/schema";
import { auditPlatform } from "@wallet/lib/audit";
import { issueLink } from "@wallet/lib/auth/links";
import { isMemberRole } from "@wallet/lib/auth/permissions";
import { withPlatform } from "@wallet/lib/db/with-org";
import { createInvitation } from "@wallet/lib/orgs/invitations";
import { createOrg } from "@wallet/lib/orgs/service";
import { asc, count, eq } from "drizzle-orm";

const ACTIVATE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RECOVER_TTL_MS = 24 * 60 * 60 * 1000;

const argv = process.argv.slice(2);
const opt = (name: string) => {
	const i = argv.indexOf(`--${name}`);
	return i === -1 ? undefined : argv[i + 1];
};
const flag = (name: string) => argv.includes(`--${name}`);
const positional = argv.filter(
	(a, i) => !a.startsWith("--") && !argv[i - 1]?.startsWith("--"),
);
const [cmd, sub] = positional;
const CLI = { userId: null, ip: null, userAgent: "cli:wallet-admin" };

const need = (v: string | undefined, what: string): string => {
	if (!v?.trim()) throw new Error(`${what} fehlt`);
	return v.trim();
};
const until = (d: Date) =>
	d.toLocaleString("de-DE", { timeZone: "Europe/Berlin" });

async function orgBySlug(slug: string) {
	const [o] = await withPlatform(
		{ ...CLI, reason: `CLI: Org ${slug} lesen` },
		(tx) => tx.select().from(orgs).where(eq(orgs.slug, slug)).limit(1),
	);
	if (!o) throw new Error(`Org „${slug}“ gibt es nicht`);
	return o;
}

async function userByEmail(email: string) {
	const [u] = await db
		.select()
		.from(user)
		.where(eq(user.email, email.toLowerCase()))
		.limit(1);
	return u ?? null;
}

async function passkeysOf(userId: string): Promise<number> {
	const [r] = await db
		.select({ n: count() })
		.from(passkey)
		.where(eq(passkey.userId, userId));
	return Number(r?.n ?? 0);
}

async function main() {
	const key =
		cmd === "recover" || cmd === "invite" || cmd === "admin"
			? cmd
			: `${cmd ?? ""} ${sub ?? ""}`.trim();
	switch (key) {
		case "org create": {
			const o = await createOrg(
				{ ...CLI, reason: "CLI: Org anlegen" },
				{
					name: need(opt("name"), "--name"),
					slug: need(opt("slug"), "--slug"),
					isOperator: flag("operator"),
				},
			);
			console.log(`Org angelegt: ${o.id}`);
			return;
		}
		case "org list": {
			const rows = await withPlatform(
				{ ...CLI, reason: "CLI: Orgs auflisten" },
				(tx) =>
					tx
						.select({
							id: orgs.id,
							slug: orgs.slug,
							name: orgs.name,
							operator: orgSettings.isOperator,
							custody: orgSettings.custodyMode,
						})
						.from(orgs)
						.leftJoin(orgSettings, eq(orgSettings.organizationId, orgs.id))
						.orderBy(asc(orgs.createdAt)),
			);
			console.table(rows);
			return;
		}
		case "account create": {
			const email = need(opt("email"), "--email").toLowerCase();
			const name = need(opt("name"), "--name");
			const role = opt("role") ?? "owner";
			if (!isMemberRole(role))
				throw new Error("--role: owner, operator oder viewer");
			if (await userByEmail(email))
				throw new Error(`Konto ${email} gibt es schon`);
			const org = opt("org")
				? await orgBySlug(need(opt("org"), "--org"))
				: null;
			const [u] = await db
				.insert(user)
				.values({ email, name, role: flag("admin") ? "admin" : null })
				.returning({ id: user.id });
			if (!u) throw new Error("Konto nicht angelegt");
			if (org)
				await withPlatform(
					{ ...CLI, reason: "CLI: Mitgliedschaft anlegen" },
					(tx) =>
						tx
							.insert(members)
							.values({ organizationId: org.id, userId: u.id, role }),
				);
			await auditPlatform(CLI, {
				action: "auth.account_created",
				target: `user:${u.id}`,
				organizationId: null,
				after: {
					via: "cli",
					admin: flag("admin"),
					org: org?.slug ?? null,
					role: org ? role : null,
				},
			});
			const expiresAt = new Date(Date.now() + ACTIVATE_TTL_MS);
			const { url } = await issueLink(
				{ kind: "activate", userId: u.id, email },
				expiresAt,
			);
			console.log(
				`Konto angelegt. Aktivierungslink (gültig bis ${until(expiresAt)}):\n\n${url}\n\nNur an ${email} geben.`,
			);
			return;
		}
		case "account link": {
			const email = need(opt("email"), "--email");
			const u = await userByEmail(email);
			if (!u) throw new Error(`Konto ${email} gibt es nicht`);
			if ((await passkeysOf(u.id)) > 0)
				throw new Error(
					"Konto ist schon aktiviert — Zugang zurücksetzen mit pnpm wallet:recover",
				);
			const expiresAt = new Date(Date.now() + ACTIVATE_TTL_MS);
			const { url } = await issueLink(
				{ kind: "activate", userId: u.id, email: u.email },
				expiresAt,
			);
			await auditPlatform(CLI, {
				action: "auth.activation_link_cli",
				target: `user:${u.id}`,
			});
			console.log(
				`Aktivierungslink (gültig bis ${until(expiresAt)}):\n\n${url}`,
			);
			return;
		}
		case "account list": {
			const rows = await db
				.select({
					id: user.id,
					email: user.email,
					name: user.name,
					role: user.role,
				})
				.from(user)
				.orderBy(asc(user.createdAt));
			const withKeys = await Promise.all(
				rows.map(async (r) => ({ ...r, passkeys: await passkeysOf(r.id) })),
			);
			console.table(withKeys);
			return;
		}
		case "invite": {
			const org = await orgBySlug(need(opt("org"), "--org"));
			const role = opt("role") ?? "viewer";
			if (!isMemberRole(role))
				throw new Error("--role: owner, operator oder viewer");
			const inv = await createInvitation(
				{ orgId: org.id, userId: null, userAgent: CLI.userAgent },
				{ email: need(opt("email"), "--email"), role },
			);
			console.log(
				`Einladung in ${org.name} (gültig bis ${until(inv.expiresAt)}):\n\n${inv.url}`,
			);
			return;
		}
		case "admin": {
			const u = await userByEmail(need(opt("email"), "--email"));
			if (!u) throw new Error("Konto gibt es nicht");
			const role = flag("revoke") ? null : "admin";
			await db.update(user).set({ role }).where(eq(user.id, u.id));
			await auditPlatform(CLI, {
				action: "auth.platform_role_changed",
				target: `user:${u.id}`,
				before: { role: u.role },
				after: { role },
			});
			console.log(
				role
					? `${u.email} ist Plattform-Admin.`
					: `${u.email} ist kein Plattform-Admin mehr.`,
			);
			return;
		}
		case "recover": {
			const email = need(sub, "Adresse");
			const u = await userByEmail(email);
			if (!u) throw new Error(`Konto ${email} gibt es nicht`);
			const removed = await db
				.delete(passkey)
				.where(eq(passkey.userId, u.id))
				.returning({ id: passkey.id });
			await db.delete(session).where(eq(session.userId, u.id));
			const expiresAt = new Date(Date.now() + RECOVER_TTL_MS);
			const { url } = await issueLink(
				{ kind: "recover", userId: u.id, email: u.email },
				expiresAt,
			);
			await auditPlatform(CLI, {
				action: "auth.access_reset",
				target: `user:${u.id}`,
				after: { via: "cli", passkeysRemoved: removed.length },
			});
			console.log(
				`Zugang zurückgesetzt (${removed.length} Passkeys, alle Sitzungen entfernt).\nLink für einen neuen Passkey (gültig bis ${until(expiresAt)}):\n\n${url}`,
			);
			return;
		}
		default:
			console.log(
				readFileSync(new URL(import.meta.url), "utf8").split("*/")[0],
			);
			process.exitCode = 1;
	}
}

main()
	.catch((e) => {
		console.error(e instanceof Error ? e.message : e);
		process.exitCode = 1;
	})
	.finally(() => sqlClient.end({ timeout: 5 }));
