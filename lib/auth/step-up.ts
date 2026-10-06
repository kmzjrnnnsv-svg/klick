import { createOTP } from "@better-auth/utils/otp";
import { symmetricDecrypt } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { globalDb } from "@/db";
import { session as sessionTable, twoFactor } from "@/db/auth-schema";
import { auditPlatform } from "@/lib/audit";
import { auth } from "./server";

// Step-up (erneute MFA-Bestätigung ≤ 10 min) für sensible Aktionen. Better
// Auth kennt kein Re-Auth für bestehende Sitzungen; wir verifizieren den TOTP
// gegen das (vom Plugin verschlüsselt gespeicherte) Secret und setzen
// session.stepUpAt. Lockout wie beim Login: 5 Fehlversuche → 15 Minuten.

const MAX_FAILED = 5;
const LOCK_MS = 15 * 60 * 1000;

export type StepUpResult =
	| { ok: true }
	| { ok: false; error: "invalid" | "locked" | "not_enrolled" };

export async function verifyStepUpCode(input: {
	userId: string;
	sessionId: string;
	code: string;
	ip: string | null;
	userAgent: string | null;
}): Promise<StepUpResult> {
	const [tf] = await globalDb
		.select()
		.from(twoFactor)
		.where(eq(twoFactor.userId, input.userId))
		.limit(1);
	if (!tf) return { ok: false, error: "not_enrolled" };

	const now = Date.now();
	if (tf.lockedUntil && tf.lockedUntil.getTime() > now) {
		return { ok: false, error: "locked" };
	}

	const ctx = await auth.$context;
	const secret = await symmetricDecrypt({
		key: ctx.secretConfig,
		data: tf.secret,
	});
	const valid = await createOTP(secret, { digits: 6, period: 30 }).verify(
		input.code.trim(),
	);

	const actor = {
		userId: input.userId,
		ip: input.ip,
		userAgent: input.userAgent,
	};
	if (!valid) {
		const failed = (tf.failedVerificationCount ?? 0) + 1;
		await globalDb
			.update(twoFactor)
			.set({
				failedVerificationCount: failed,
				lockedUntil: failed >= MAX_FAILED ? new Date(now + LOCK_MS) : null,
			})
			.where(eq(twoFactor.id, tf.id));
		await auditPlatform(actor, {
			action: "auth.step_up_failed",
			outcome: "failure",
			after: { failed, locked: failed >= MAX_FAILED },
		});
		return { ok: false, error: failed >= MAX_FAILED ? "locked" : "invalid" };
	}

	await globalDb
		.update(twoFactor)
		.set({ failedVerificationCount: 0, lockedUntil: null })
		.where(eq(twoFactor.id, tf.id));
	await globalDb
		.update(sessionTable)
		.set({ stepUpAt: new Date(now), lastActiveAt: new Date(now) })
		.where(eq(sessionTable.id, input.sessionId));
	await auditPlatform(actor, {
		action: "auth.step_up",
		target: `session:${input.sessionId}`,
	});
	return { ok: true };
}
