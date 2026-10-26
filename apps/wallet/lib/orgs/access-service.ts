import { orgSettings } from "@wallet/db/schema";
import { mutateOrg, type OrgCtx } from "@wallet/lib/db/with-org";
import { notify } from "@wallet/lib/notifications/notify";
import { eq } from "drizzle-orm";
import { parseCidr } from "@/lib/net/ip";
import { type ActionResult, fail } from "@/lib/validation/common";
import type { AccessPolicyInput } from "../validation/access";
import { accessPolicyTx, invalidateAccessPolicy } from "./access";
import {
	type AccessChange,
	accessChanges,
	accessPolicyOf,
	isRelaxing,
	type WalletAccessPolicy,
	walletNetworkAllows,
} from "./access-policy";

// Zugangsregeln speichern (Härtung W). Nur Inhaber:innen mit Step-up (die
// Action prüft das). Schutz vor Selbstaussperren: die eigene Adresse muss in
// der neuen Liste liegen, und „nur Sicherheitsschlüssel“ schaltet nur ein,
// wer selbst nur gerätegebundene Schlüssel hat. Lockerungen melden alle
// Inhaber:innen sofort (Mail), Verschärfungen alle Mitglieder.

const view = (p: WalletAccessPolicy) => ({
	network: p.network.members,
	securityKeysOnly: p.securityKeysOnly,
	allowedAssets: p.allowedAssets,
	mandatesRequired: p.mandatesRequired,
});

export async function updateAccessPolicy(
	ctx: OrgCtx,
	input: AccessPolicyInput,
	actor: { ip: string | null; onlyDeviceBound: boolean },
): Promise<ActionResult<{ changes: AccessChange[] }>> {
	const next = accessPolicyOf({
		networkPolicy: {
			members: input.network.map((e) => ({
				cidr: parseCidr(e.cidr)?.text ?? e.cidr,
				note: e.note,
			})),
		},
		securityKeysOnly: input.securityKeysOnly,
		allowedAssets: input.allowedAssets,
		mandatesRequired: input.mandatesRequired,
	});
	if (!walletNetworkAllows(next, actor.ip)) return fail("lockout");
	if (next.securityKeysOnly && !actor.onlyDeviceBound)
		return fail("security_key_self");
	const res = await mutateOrg<ActionResult<{ changes: AccessChange[] }>>(
		ctx,
		async (tx) => {
			const prev = await accessPolicyTx(tx, ctx.orgId);
			const changes = accessChanges(prev, next);
			const notesChanged =
				JSON.stringify(prev.network.members) !==
				JSON.stringify(next.network.members);
			if (changes.length === 0 && !notesChanged)
				return { result: { ok: true, data: { changes } }, audit: [] };
			await tx
				.update(orgSettings)
				.set({
					networkPolicy: { members: next.network.members },
					securityKeysOnly: next.securityKeysOnly,
					allowedAssets: next.allowedAssets,
					mandatesRequired: next.mandatesRequired,
					updatedAt: new Date(),
				})
				.where(eq(orgSettings.organizationId, ctx.orgId));
			const relaxed = changes.some(isRelaxing);
			if (changes.length > 0)
				await notify(tx, {
					orgId: ctx.orgId,
					actorUserId: ctx.userId,
					kind: relaxed ? "security_alert" : "member",
					title: relaxed
						? "Zugangsregeln gelockert"
						: "Zugangsregeln verschärft",
					body: changes.map((c) => CHANGE_TEXT[c]).join(" "),
					link: "/settings/access",
					roles: relaxed ? ["owner"] : undefined,
				});
			return {
				result: { ok: true, data: { changes } },
				audit: {
					action: "org.access_policy_changed",
					target: `org:${ctx.orgId}`,
					before: view(prev),
					after: { ...view(next), changes },
				},
			};
		},
	);
	invalidateAccessPolicy(ctx.orgId);
	return res;
}

const CHANGE_TEXT: Record<AccessChange, string> = {
	network_tightened: "IP-Liste enger gefasst.",
	network_relaxed: "IP-Liste erweitert oder ausgeschaltet.",
	security_keys_on: "Nur noch Sicherheitsschlüssel.",
	security_keys_off: "Synchronisierte Passkeys wieder erlaubt.",
	assets_tightened: "Weniger Assets erlaubt.",
	assets_relaxed: "Weitere Assets erlaubt.",
	mandates_on: "Bedienung zahlt nur noch mit Vollmacht aus.",
	mandates_off: "Auszahlungen ohne Vollmacht wieder möglich.",
};
