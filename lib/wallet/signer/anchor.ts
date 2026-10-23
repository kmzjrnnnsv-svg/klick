import { eq } from "drizzle-orm";
import { walletSignerAnchor } from "@/db/schema";
import { audit } from "@/lib/audit";
import type { OrgTx } from "@/lib/db/with-org";
import { notify } from "@/lib/notifications/notify";
import { membersAllowed } from "@/lib/org/roles";
import type { SignerMeta } from "./client";

// Journal-Anker: Klick merkt sich den zuletzt gesehenen Kopf (seq, head) des
// Signer-Journals. Läuft seq zurück oder ändert sich der Hash bei gleicher
// seq, wurde das Journal ersetzt (z. B. ein altes Backup eingespielt, um
// Freigaben oder Ausgaben „vergessen“ zu lassen) → Alarm, Anker bleibt.
// Eine kleinere seq kann auch eine überholte Antwort sein (Job und Aktion
// fragen gleichzeitig; der Signer arbeitet der Reihe nach, gespeichert wird
// in anderer Reihenfolge): ohne `detect` gilt sie als „stale“ und ändert
// nichts. Erkennen ist Sache des Jobs, der dafür frisch nachfragt.
// Gleiche seq mit anderem Hash ist nie ein Wettlauf → immer Alarm.

export type AnchorCheck = "ok" | "regressed" | "forked";
export type AnchorResult = AnchorCheck | "stale";

export const anchorOk = (r: AnchorResult) => r === "ok" || r === "stale";

export function compareAnchor(
	stored: SignerMeta | null,
	seen: SignerMeta,
): AnchorCheck {
	if (!stored) return "ok";
	if (seen.seq < stored.seq) return "regressed";
	if (seen.seq === stored.seq && seen.head !== stored.head) return "forked";
	return "ok";
}

const ALERT_EVERY_MS = 24 * 3600_000;

export async function recordAnchor(
	tx: OrgTx,
	orgId: string,
	seen: SignerMeta & {
		bundleHash?: string | null;
		policyHash?: string | null;
		frozen?: { reason: string } | null;
	},
	now = new Date(),
	opts: { detect?: boolean } = {},
): Promise<AnchorResult> {
	const [stored] = await tx
		.select()
		.from(walletSignerAnchor)
		.where(eq(walletSignerAnchor.organizationId, orgId))
		.limit(1);
	const check = compareAnchor(stored ?? null, seen);
	if (check === "regressed" && !opts.detect) return "stale";
	const extra = {
		...(seen.bundleHash !== undefined ? { bundleHash: seen.bundleHash } : {}),
		...(seen.policyHash !== undefined ? { policyHash: seen.policyHash } : {}),
		...(seen.frozen !== undefined
			? {
					frozen: Boolean(seen.frozen),
					frozenReason: seen.frozen?.reason ?? null,
				}
			: {}),
	};
	if (check === "ok") {
		if (!stored)
			await tx.insert(walletSignerAnchor).values({
				organizationId: orgId,
				seq: seen.seq,
				head: seen.head,
				checkedAt: now,
				...extra,
			});
		else
			await tx
				.update(walletSignerAnchor)
				.set({
					...(seen.seq >= stored.seq ? { seq: seen.seq, head: seen.head } : {}),
					checkedAt: now,
					unreachableSince: null,
					...extra,
				})
				.where(eq(walletSignerAnchor.id, stored.id));
		return check;
	}
	// Alarm höchstens einmal am Tag; der Anker bleibt auf dem alten Stand
	if (
		stored &&
		(!stored.alertedAt ||
			now.getTime() - stored.alertedAt.getTime() > ALERT_EVERY_MS)
	) {
		await tx
			.update(walletSignerAnchor)
			.set({ alertedAt: now })
			.where(eq(walletSignerAnchor.id, stored.id));
		await audit(
			tx,
			{ userId: null },
			{
				organizationId: orgId,
				action: "wallet.signer_head_regressed",
				target: `wallet_signer:${orgId}`,
				before: { seq: stored.seq, head: stored.head },
				after: { seq: seen.seq, head: seen.head, check },
			},
		);
		await notify(tx, {
			orgId,
			recipients: await membersAllowed(tx, orgId, { wallet: ["read"] }),
			actorUserId: null,
			kind: "security_alert",
			title: "Signer-Journal zurückgesetzt",
			body: `Der Signer meldet Stand ${seen.seq}, Klick kennt bereits ${stored.seq}. Das Journal wurde ersetzt — Auszahlungen stoppen und den Server prüfen.`,
			link: "/wallet/sicherheit",
		});
	}
	return check;
}
