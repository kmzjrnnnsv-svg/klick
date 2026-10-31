"use server";

import { revalidatePath } from "next/cache";
import { safeAction } from "@/lib/actions/safe";
import { auditPlatform } from "@/lib/audit";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { retryFailedJob } from "@/lib/db/admin-jobs";
import { mailErrorHint, sendTransactionalMail } from "@/lib/mail/send";
import { transactionalEmail } from "@/lib/mail/templates";
import { SlidingWindowLimiter } from "@/lib/rate-limit";
import type { ActionResult } from "@/lib/validation/common";

// Admin > Betrieb (Admin-Portal, Teil 5): fehlgeschlagene Hintergrundaufgabe
// erneut starten und Testmail an das eigene Konto. Beides ändert keine Daten
// einer Org; Audit im Plattform-Protokoll.

const JOB_NAME = /^[a-z0-9][a-z0-9-]{1,63}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const testMails = new SlidingWindowLimiter(3, 10 * 60_000);

async function retryJobImpl(
	name: string,
	id: string,
): Promise<ActionResult<{ retried: number }>> {
	const a = await requirePlatformAdmin();
	if (
		typeof name !== "string" ||
		typeof id !== "string" ||
		!JOB_NAME.test(name) ||
		!UUID.test(id)
	)
		return { ok: false, error: "not_found" };
	const retried = await retryFailedJob(name, id);
	if (retried === 0) return { ok: false, error: "not_found" };
	await auditPlatform(a, {
		action: "admin.job_retried",
		target: `job:${id}`,
		after: { name },
	});
	revalidatePath("/admin/betrieb");
	return { ok: true, data: { retried } };
}

// Ergebnis auch bei Fehlschlag als Daten: die Seite zeigt Zustellweg und
// Hinweis (wie pnpm mail:check), nicht nur „Fehler“.
async function sendTestMailImpl(): Promise<
	ActionResult<{
		delivered: boolean;
		path: string;
		to: string;
		hint: string | null;
	}>
> {
	const a = await requirePlatformAdmin();
	if (!testMails.check(a.userId).allowed)
		return { ok: false, error: "rate_limited" };
	const mail = transactionalEmail({
		subject: "Klick: Testmail aus dem Admin-Portal",
		eyebrow: "Mailversand",
		title: "Die Testmail ist angekommen.",
		body: "Diese Mail kommt aus Admin > Betrieb. Wenn sie in deinem Posteingang liegt, erreichen Anmelde-Links, Einladungen und Benachrichtigungen ihr Ziel.",
	});
	const out = await sendTransactionalMail({ to: a.email, ...mail });
	await auditPlatform(a, {
		action: "admin.test_mail",
		outcome: out.ok ? "success" : "failure",
		after: { path: out.path },
	});
	return {
		ok: true,
		data: {
			delivered: out.ok && out.path !== "console",
			path: out.path,
			to: a.email,
			hint: out.ok
				? out.path === "console"
					? mailErrorHint("no_provider", {})
					: null
				: (mailErrorHint(out.error, {}) ?? out.error.slice(0, 200)),
		},
	};
}

export const retryJob = safeAction("retryJob", retryJobImpl);
export const sendTestMail = safeAction("sendTestMail", sendTestMailImpl);
