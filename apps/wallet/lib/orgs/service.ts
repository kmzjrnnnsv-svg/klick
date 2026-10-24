import type { MemberRole } from "@wallet/db/schema";
import { members, orgSettings, orgs } from "@wallet/db/schema";
import { audit } from "@wallet/lib/audit";
import { newWrappedDek } from "@wallet/lib/crypto/org-dek";
import { type PlatformCtx, withPlatform } from "@wallet/lib/db/with-org";

// Organisationen anlegen: nur Plattform (pnpm wallet:admin), mit eigenem
// Org-DEK und optional erster Inhaber:in. Pure Prüfung des Kurznamens.

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

export function slugIssue(slug: string): string | null {
	if (!SLUG_RE.test(slug)) return "3–40 Zeichen: a–z, 0–9 und Bindestrich";
	// Subdomains der Plattform bleiben frei (approve.both.money …)
	if (["approve", "www", "api", "admin", "mail"].includes(slug))
		return "reserviert";
	return null;
}

export async function createOrg(
	ctx: PlatformCtx,
	input: {
		name: string;
		slug: string;
		isOperator?: boolean;
		owner?: { userId: string; role?: MemberRole };
	},
): Promise<{ id: string }> {
	const issue = slugIssue(input.slug);
	if (issue) throw new Error(`Kurzname „${input.slug}“: ${issue}`);
	const dek = await newWrappedDek();
	return withPlatform(ctx, async (tx) => {
		const [org] = await tx
			.insert(orgs)
			.values({ name: input.name.trim(), slug: input.slug })
			.returning({ id: orgs.id });
		if (!org) throw new Error("org insert failed");
		await tx.insert(orgSettings).values({
			organizationId: org.id,
			...dek,
			isOperator: input.isOperator ?? false,
			// Betreiber verwaltet eigene Bestände; Kundengelder erst mit Erlaubnis
			custodyMode: input.isOperator ? "own" : "none",
		});
		if (input.owner)
			await tx.insert(members).values({
				organizationId: org.id,
				userId: input.owner.userId,
				role: input.owner.role ?? "owner",
				invitedBy: ctx.userId,
			});
		await audit(
			tx,
			{ userId: ctx.userId },
			{
				action: "org.created",
				target: `org:${org.id}`,
				organizationId: org.id,
				after: {
					name: input.name.trim(),
					slug: input.slug,
					isOperator: input.isOperator ?? false,
					owner: input.owner?.userId ?? null,
				},
			},
		);
		return { id: org.id };
	});
}
