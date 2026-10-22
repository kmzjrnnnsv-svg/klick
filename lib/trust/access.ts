import { createHmac } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { type TrustAccessRequest, trustAccessRequests } from "@/db/schema";
import type { PublicTrustCenter } from "@/lib/db/trust";
import { mutateOrg, readOrg } from "@/lib/db/with-org";
import { type ResolvedToken, resolveToken } from "@/lib/db/with-token";
import { env } from "@/lib/env";
import { notify } from "@/lib/notifications/notify";
import { orgOwnerIds } from "@/lib/org/queries";
import { requestState } from "./rules";

// Zugang zu NDA-Unterlagen ohne Konto (ADR-017): Token aus dem Link
// (Fragment → POST) bzw. aus dem Cookie, passend zur Org des Trust Centers
// und zu einer freigegebenen, nicht abgelaufenen Anfrage.

// Ein Cookie je Trust Center (Name mit Slug), nur unter /api/vertrauen —
// wer mehrere Trust Center freigeschaltet hat, behält alle Zugänge.
export const TRUST_COOKIE_PATH = "/api/vertrauen";
export const trustCookieName = (slug: string) => `kt_${slug}`;

export function cookieValue(req: Request, name: string): string | null {
	const header = req.headers.get("cookie");
	if (!header) return null;
	for (const part of header.split(";")) {
		const [k, ...v] = part.trim().split("=");
		if (k !== name) continue;
		try {
			return decodeURIComponent(v.join("="));
		} catch {
			return null;
		}
	}
	return null;
}

export function trustIpHash(ip: string): string {
	return createHmac("sha256", env().BETTER_AUTH_SECRET)
		.update(`trust:${ip}`)
		.digest("hex")
		.slice(0, 32);
}

export type TrustAccess = {
	token: ResolvedToken;
	request: Pick<
		TrustAccessRequest,
		"id" | "name" | "company" | "email" | "expiresAt"
	>;
};

export async function resolveTrustAccess(
	raw: string,
	center: PublicTrustCenter,
	now = new Date(),
): Promise<{ ok: true; access: TrustAccess } | { ok: false; error: string }> {
	const r = await resolveToken(raw, "trust_center", now);
	if (!r.ok) return { ok: false, error: r.error };
	const t = r.token;
	if (
		t.organizationId !== center.organizationId ||
		t.subjectType !== "trust_request" ||
		!t.subjectId
	)
		return { ok: false, error: "invalid" };
	const subjectId = t.subjectId;
	const req = await readOrg(
		{ orgId: t.organizationId, userId: null },
		async (tx) => {
			const [row] = await tx
				.select({
					id: trustAccessRequests.id,
					name: trustAccessRequests.name,
					company: trustAccessRequests.company,
					email: trustAccessRequests.email,
					status: trustAccessRequests.status,
					expiresAt: trustAccessRequests.expiresAt,
					tokenId: trustAccessRequests.tokenId,
				})
				.from(trustAccessRequests)
				.where(
					and(
						eq(trustAccessRequests.id, subjectId),
						eq(trustAccessRequests.organizationId, t.organizationId),
					),
				)
				.limit(1);
			return row ?? null;
		},
	);
	if (!req || req.tokenId !== t.id) return { ok: false, error: "invalid" };
	const state = requestState(req, now);
	if (state !== "active") return { ok: false, error: state };
	return { ok: true, access: { token: t, request: req } };
}

// Neue Anfrage aus dem öffentlichen Formular. Dieselbe Adresse mit offener
// Anfrage aus den letzten 24 h wird nicht doppelt angelegt (gleiche Antwort
// nach außen). Owner bekommen eine Benachrichtigung (Sofort-Mail).
export async function createTrustRequest(input: {
	center: PublicTrustCenter;
	name: string;
	email: string;
	company: string;
	reason: string | null;
	ndaVersion: string;
	ip: string;
	userAgent: string | null;
}): Promise<{ created: boolean }> {
	const orgId = input.center.organizationId;
	return mutateOrg<{ created: boolean }>(
		{ orgId, userId: null, ip: null, userAgent: input.userAgent },
		async (tx) => {
			const [open] = await tx
				.select({ id: trustAccessRequests.id })
				.from(trustAccessRequests)
				.where(
					and(
						eq(trustAccessRequests.organizationId, orgId),
						eq(trustAccessRequests.email, input.email),
						eq(trustAccessRequests.status, "pending"),
						gt(
							trustAccessRequests.createdAt,
							new Date(Date.now() - 86_400_000),
						),
					),
				)
				.limit(1);
			if (open) return { result: { created: false }, audit: [] };
			const ipHash = trustIpHash(input.ip);
			const [row] = await tx
				.insert(trustAccessRequests)
				.values({
					organizationId: orgId,
					name: input.name,
					email: input.email,
					company: input.company,
					reason: input.reason,
					ndaAcceptedAt: new Date(),
					ndaVersion: input.ndaVersion,
					ipHash,
				})
				.returning({ id: trustAccessRequests.id });
			if (!row) throw new Error("insert failed");
			await notify(tx, {
				orgId,
				recipients: await orgOwnerIds(tx, orgId),
				actorUserId: null,
				kind: "inquiry",
				title: `Trust Center: Anfrage von ${input.company}`,
				body: `${input.name} bittet um Zugang zu den vertraulichen Unterlagen.`,
				link: "/trust-center?tab=anfragen",
				payload: { trustRequestId: row.id, dedupeKey: `trust:${row.id}` },
			});
			return {
				result: { created: true },
				audit: {
					action: "trust.access_requested",
					target: `trust_request:${row.id}`,
					after: {
						via: "trust_center",
						company: input.company,
						ndaVersion: input.ndaVersion,
						ipHash,
					},
				},
			};
		},
	);
}
