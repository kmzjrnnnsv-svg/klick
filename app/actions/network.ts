"use server";

import { eq } from "drizzle-orm";
import { orgSettings } from "@/db/schema";
import { safeAction } from "@/lib/actions/safe";
import { requireStepUp, toOrgCtx } from "@/lib/auth/guards";
import { readOrg } from "@/lib/db/with-org";
import { locksOut, networkPolicyOf } from "@/lib/net/network-policy";
import { requestApplyChange } from "@/lib/security-changes/service";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import { networkPolicySchema } from "@/lib/validation/network";

// Einstellungen > Netzwerk (Härtung A5, ADR-029): IP-Liste der Organisation.
// Jede Änderung über Vier-Augen (lib/security-changes); speichern nur, wenn
// die eigene Adresse danach noch hineinkommt. Notweg am Terminal:
// pnpm org:network-reset.
async function saveNetworkPolicyImpl(input: unknown): Promise<ActionResult> {
	const c = await requireStepUp({ settings: ["update"] });
	if (c.orgRole !== "owner") return { ok: false, error: "forbidden" };
	const parsed = networkPolicySchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const next = networkPolicyOf(parsed.data);
	if (locksOut(next, c.ip)) return { ok: false, error: "network_self_lockout" };
	const [current] = await readOrg(toOrgCtx(c), (tx) =>
		tx
			.select({ networkPolicy: orgSettings.networkPolicy })
			.from(orgSettings)
			.where(eq(orgSettings.organizationId, c.orgId))
			.limit(1),
	);
	const before = current?.networkPolicy ?? {};
	if (JSON.stringify(networkPolicyOf(before)) === JSON.stringify(next))
		return { ok: true, data: undefined };
	return requestApplyChange(c, {
		kind: "network_policy",
		targetKey: null,
		summary:
			next.members.length === 0
				? "IP-Liste ausschalten"
				: `IP-Liste: ${next.members.length} Netz(e) für Mitglieder`,
		payload: { value: next },
		before,
	});
}

export const saveNetworkPolicy = safeAction(
	"saveNetworkPolicy",
	saveNetworkPolicyImpl,
);
