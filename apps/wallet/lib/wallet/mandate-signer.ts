import { payoutMandates, walletPayouts } from "@wallet/db/schema";
import { mutateOrg, type OrgCtx, readOrg } from "@wallet/lib/db/with-org";
import { openMandatePayouts } from "@wallet/lib/wallet/mandates";
import { anchorOk, recordAnchor } from "@wallet/lib/wallet/signer/anchor";
import {
	confirmOrigin,
	SignerCallError,
	type SignerMandateView,
	signerCall,
	signerErrorCode,
} from "@wallet/lib/wallet/signer/client";
import { helloForOrg } from "@wallet/lib/wallet/signer/org";
import { and, eq } from "drizzle-orm";
import { type ActionResult, fail } from "@/lib/validation/common";

// Vollmacht im Signer (Härtung W, Schritt 2): die App reicht den
// unterschriebenen Text weiter, freigeben kann ihn nur das Quorum der
// Sicherheitsschlüssel auf der Bestätigungsseite (#m=<id>). Erst dann zählen
// Auszahlungen der Bedienung im Rahmen als vorab freigegeben. Widerrufen
// bremst und geht immer. Ohne eigenen Signer bleibt es bei Schritt 1.

export const mandateConfirmUrl = (mandateId: string): string | null => {
	const origin = confirmOrigin();
	return origin ? `${origin}/#m=${mandateId}` : null;
};

export type SignerMandates =
	| { ok: true; byId: Map<string, SignerMandateView> }
	| { ok: false; error: string };

/** Offene und freigegebene Vollmachten im Signer (nicht widerrufen/abgelaufen). */
export async function signerMandates(orgId: string): Promise<SignerMandates> {
	const s = await helloForOrg(orgId);
	if ("error" in s) return { ok: false, error: s.error as string };
	try {
		const r = await signerCall<{ mandates?: SignerMandateView[] }>("status");
		return {
			ok: true,
			byId: new Map((r.result.mandates ?? []).map((m) => [m.mandateId, m])),
		};
	} catch (e) {
		return { ok: false, error: signerErrorCode(e) };
	}
}

/** Vollmacht im Signer anlegen (idempotent: gleicher Text = derselbe Eintrag). */
export async function registerMandateInSigner(
	ctx: OrgCtx & { userId: string },
	mandateId: string,
): Promise<ActionResult<{ confirmUrl: string | null }>> {
	const [row] = await readOrg(ctx, (tx) =>
		tx
			.select({
				text: payoutMandates.text,
				revokedAt: payoutMandates.revokedAt,
			})
			.from(payoutMandates)
			.where(
				and(
					eq(payoutMandates.id, mandateId),
					eq(payoutMandates.organizationId, ctx.orgId),
				),
			)
			.limit(1),
	);
	if (!row) return fail("notFound");
	if (row.revokedAt) return fail("mandate_revoked");
	const s = await helloForOrg(ctx.orgId);
	if ("error" in s) return fail(s.error as string);
	let created: { result: SignerMandateView; seq: number; head: string };
	try {
		created = await signerCall("mandate.create", { text: row.text });
	} catch (e) {
		return fail(signerErrorCode(e));
	}
	return mutateOrg<ActionResult<{ confirmUrl: string | null }>>(
		ctx,
		async (tx) => {
			if (!anchorOk(await recordAnchor(tx, ctx.orgId, created)))
				return { result: fail("signer_journal"), audit: [] };
			return {
				result: {
					ok: true,
					data: { confirmUrl: mandateConfirmUrl(mandateId) },
				},
				audit: {
					action: "wallet.mandate_signer_registered",
					target: `payout_mandate:${mandateId}`,
					after: { seq: created.seq, active: created.result.active },
				},
			};
		},
	);
}

/** Im Signer widerrufen (bremst; App und root dürfen). */
export async function revokeMandateInSigner(
	ctx: OrgCtx & { userId: string },
	mandateId: string,
): Promise<ActionResult> {
	const s = await helloForOrg(ctx.orgId);
	if ("error" in s) return fail(s.error as string);
	let revoked: { result: SignerMandateView; seq: number; head: string };
	try {
		revoked = await signerCall("mandate.revoke", { mandateId });
	} catch (e) {
		// im Signer unbekannt: dort gibt es nichts zu widerrufen
		if (signerErrorCode(e) === "signer_mandate_unknown")
			return { ok: true, data: undefined };
		return fail(signerErrorCode(e));
	}
	return mutateOrg<ActionResult>(ctx, async (tx) => {
		await recordAnchor(tx, ctx.orgId, revoked);
		return {
			result: { ok: true, data: undefined },
			audit: {
				action: "wallet.mandate_signer_revoked",
				target: `payout_mandate:${mandateId}`,
				after: { seq: revoked.seq },
			},
		};
	});
}

/**
 * Auszahlungen auf einer widerrufenen Vollmacht, die noch nicht signiert
 * sind, im Signer abbrechen (Selbstprüfung B1); schon signierte bekommen den
 * Abbruch-Wunsch wie beim Knopf „Abbrechen“. Liefert die Zahl der nicht
 * abgebrochenen (Signer nicht erreichbar).
 */
export async function cancelMandatePayouts(
	ctx: OrgCtx & { userId: string | null },
	mandateId: string,
): Promise<{ cancelled: number; failed: number }> {
	const open = await readOrg(ctx, (tx) =>
		openMandatePayouts(tx, ctx.orgId, mandateId),
	);
	let cancelled = 0;
	let failed = 0;
	for (const p of open) {
		let meta: { seq: number; head: string } | null = null;
		try {
			const r = await signerCall("intent.cancel", { intentId: p.intentId });
			meta = { seq: r.seq, head: r.head };
		} catch (e) {
			if (
				!(e instanceof SignerCallError && e.signerCode === "already_signed")
			) {
				failed++;
				continue;
			}
		}
		await mutateOrg(ctx, async (tx) => {
			if (meta) await recordAnchor(tx, ctx.orgId, meta);
			await tx
				.update(walletPayouts)
				.set(meta ? { status: "cancelled" } : { cancelRequested: true })
				.where(eq(walletPayouts.id, p.id));
			return {
				result: null,
				audit: {
					action: meta
						? "wallet.payout_cancelled"
						: "wallet.payout_cancel_requested",
					target: `wallet_payout:${p.id}`,
					before: { status: p.status },
					after: { reason: "mandate_revoked", mandateId },
				},
			};
		});
		cancelled++;
	}
	return { cancelled, failed };
}
