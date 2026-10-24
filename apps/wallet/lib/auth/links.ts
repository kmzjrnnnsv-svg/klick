import { createHash, randomBytes } from "node:crypto";
import { db } from "@wallet/db";
import { user, verification } from "@wallet/db/auth-schema";
import { invitations, orgs } from "@wallet/db/schema";
import type { MemberRole } from "@wallet/db/schema/enums";
import { readOrg } from "@wallet/lib/db/with-org";
import { and, eq, like, sql } from "drizzle-orm";
import { baseURL } from "./config";

// Einmal-Links zur Passkey-Registrierung (wie Klick, ADR-019):
// - kwl_activate_… erster Passkey für ein angelegtes Konto (wallet:admin)
// - kwl_recover_…  neuer Passkey nach Zurücksetzen (wallet:recover)
// - kwl_invite_…   neues Konto für eine offene Einladung in eine Org
// Gespeichert wird nur der SHA-256 (verification). Der Token steht im
// URL-Fragment; die Seite tauscht ihn über /api/link gegen ein httpOnly-
// Cookie, das nur die Passkey-Endpunkte sehen.

export const LINK_COOKIE = "both_link";
export const LINK_COOKIE_PATH = "/api/auth/passkey";
// ?context= der Registrierung: nur ein Merker, der Token steht im Cookie
export const LINK_CONTEXT = "link";

export type LinkKind = "invite" | "recover" | "activate";

export const LINK_PREFIX: Record<LinkKind, string> = {
	invite: "kwl_invite_",
	recover: "kwl_recover_",
	activate: "kwl_activate_",
};

const PAGE: Record<LinkKind, string> = {
	invite: "invite",
	recover: "activate",
	activate: "activate",
};

export type LinkPayload =
	| {
			kind: "invite";
			invitationId: string;
			organizationId: string;
			email: string;
			name?: string;
	  }
	| {
			kind: "recover" | "activate";
			userId: string;
			email: string;
			name?: string;
	  };

export function kindOfToken(raw: string): LinkKind | null {
	for (const kind of Object.keys(LINK_PREFIX) as LinkKind[])
		if (raw.startsWith(LINK_PREFIX[kind])) return kind;
	return null;
}

const hashOf = (raw: string) => createHash("sha256").update(raw).digest("hex");
const identifierOf = (kind: LinkKind, raw: string) =>
	`link-${kind}:${hashOf(raw)}`;

export function linkUrl(raw: string): string {
	return `${baseURL}/${PAGE[kindOfToken(raw) ?? "invite"]}#${raw}`;
}

// Ein gültiger Link je Einladung bzw. Konto und Art
export async function revokeLinks(
	subject:
		| { invitationId: string }
		| { userId: string; kind: "recover" | "activate" },
): Promise<void> {
	const [kind, field, id] =
		"invitationId" in subject
			? (["invite", "invitationId", subject.invitationId] as const)
			: ([subject.kind, "userId", subject.userId] as const);
	await db
		.delete(verification)
		.where(
			and(
				like(verification.identifier, `link-${kind}:%`),
				sql`${verification.value}::jsonb->>${field} = ${id}`,
			),
		);
}

export async function issueLink(
	payload: LinkPayload,
	expiresAt: Date,
): Promise<{ token: string; url: string }> {
	await revokeLinks(
		payload.kind === "invite"
			? { invitationId: payload.invitationId }
			: { userId: payload.userId, kind: payload.kind },
	);
	const token = `${LINK_PREFIX[payload.kind]}${randomBytes(32).toString("base64url")}`;
	await db.insert(verification).values({
		identifier: identifierOf(payload.kind, token),
		value: JSON.stringify(payload),
		expiresAt,
	});
	return { token, url: linkUrl(token) };
}

async function readToken(
	raw: string,
): Promise<{ payload: LinkPayload; expiresAt: Date } | null> {
	const kind = kindOfToken(raw);
	if (!kind || raw.length > 200) return null;
	const [row] = await db
		.select({ value: verification.value, expiresAt: verification.expiresAt })
		.from(verification)
		.where(eq(verification.identifier, identifierOf(kind, raw)))
		.limit(1);
	if (!row || row.expiresAt.getTime() < Date.now()) return null;
	const payload = JSON.parse(row.value) as LinkPayload;
	return payload.kind === kind ? { payload, expiresAt: row.expiresAt } : null;
}

export async function setLinkName(raw: string, name: string): Promise<void> {
	const t = await readToken(raw);
	if (!t) return;
	await db
		.update(verification)
		.set({ value: JSON.stringify({ ...t.payload, name }) })
		.where(eq(verification.identifier, identifierOf(t.payload.kind, raw)));
}

export async function consumeLink(raw: string): Promise<void> {
	const kind = kindOfToken(raw);
	if (!kind) return;
	await db
		.delete(verification)
		.where(eq(verification.identifier, identifierOf(kind, raw)));
}

export type LinkInfo =
	| {
			kind: "invite";
			invitationId: string;
			organizationId: string;
			organization: string;
			email: string;
			role: MemberRole;
			accountExists: boolean;
			expiresAt: Date;
	  }
	| {
			kind: "recover" | "activate";
			email: string;
			name: string;
			expiresAt: Date;
	  };

export type ResolvedLink =
	| { ok: true; info: LinkInfo; payload: LinkPayload }
	| { ok: false };

// Offene Einladung lesen — im Kontext der Org aus dem gespeicherten Link
export async function openInvitation(organizationId: string, id: string) {
	return readOrg({ orgId: organizationId, userId: null }, async (tx) => {
		const [inv] = await tx
			.select({
				id: invitations.id,
				email: invitations.email,
				role: invitations.role,
				status: invitations.status,
				expiresAt: invitations.expiresAt,
				organization: orgs.name,
			})
			.from(invitations)
			.innerJoin(orgs, eq(orgs.id, invitations.organizationId))
			.where(eq(invitations.id, id))
			.limit(1);
		if (
			!inv ||
			inv.status !== "pending" ||
			inv.expiresAt.getTime() < Date.now()
		)
			return null;
		return inv;
	});
}

// Token prüfen und gegen den aktuellen Stand lesen (Einladung noch offen,
// Konto noch vorhanden) — sonst verbraucht die Registrierung den Token und
// scheitert erst an der Sitzung.
export async function resolveLink(
	raw: string | null | undefined,
): Promise<ResolvedLink> {
	const t = raw ? await readToken(raw.trim()) : null;
	if (!t) return { ok: false };
	const p = t.payload;
	if (p.kind === "invite") {
		const inv = await openInvitation(p.organizationId, p.invitationId);
		if (!inv || inv.email.toLowerCase() !== p.email.toLowerCase())
			return { ok: false };
		const [existing] = await db
			.select({ id: user.id })
			.from(user)
			.where(eq(user.email, p.email.toLowerCase()))
			.limit(1);
		return {
			ok: true,
			payload: p,
			info: {
				kind: "invite",
				invitationId: inv.id,
				organizationId: p.organizationId,
				organization: inv.organization,
				email: inv.email,
				role: inv.role,
				accountExists: Boolean(existing),
				expiresAt: t.expiresAt,
			},
		};
	}
	const [u] = await db
		.select({ id: user.id, email: user.email, name: user.name })
		.from(user)
		.where(eq(user.id, p.userId))
		.limit(1);
	if (!u || u.email.toLowerCase() !== p.email.toLowerCase())
		return { ok: false };
	return {
		ok: true,
		payload: p,
		info: {
			kind: p.kind,
			email: u.email,
			name: u.name,
			expiresAt: t.expiresAt,
		},
	};
}
