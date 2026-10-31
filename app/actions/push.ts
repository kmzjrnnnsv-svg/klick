"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { pushSubscriptions } from "@/db/schema";
import { safeAction } from "@/lib/actions/safe";
import { getSessionCtx, requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { mutateOrg, readOrg } from "@/lib/db/with-org";
import { pushConfig } from "@/lib/push/config";
import { pushEndpointAllowed } from "@/lib/push/endpoint";
import { webPushSender } from "@/lib/push/http";
import { removeDevice, saveDevice } from "@/lib/push/service";
import { SlidingWindowLimiter } from "@/lib/rate-limit";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import { pushSubscriptionSchema } from "@/lib/validation/push";

// Push auf diesem Gerät (Einstellungen > Benachrichtigungen): jede Person
// nur für sich, auch Mitarbeitende. Nie in einer Impersonation-Sitzung —
// sonst bekäme das Gerät des Klick-Betriebs die Hinweise der Person über
// das Ende der Freigabe hinaus (Lockbox, Härtung A3).

const PATH = "/einstellungen";
const testLimiter = new SlidingWindowLimiter(5, 10 * 60_000);

async function notImpersonating(): Promise<boolean> {
	const s = await getSessionCtx();
	return !s?.session.impersonatedBy;
}

async function savePushSubscriptionImpl(input: unknown): Promise<ActionResult> {
	const c = await requireOrg(undefined, { employees: true });
	if (!(await notImpersonating())) return { ok: false, error: "forbidden" };
	if (!pushConfig()) return { ok: false, error: "push_not_configured" };
	const parsed = pushSubscriptionSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	if (!pushEndpointAllowed(parsed.data.endpoint))
		return { ok: false, error: "push_endpoint_not_allowed" };
	const res = await mutateOrg(toOrgCtx(c), async (tx) => {
		const r = await saveDevice(tx, {
			orgId: c.orgId,
			userId: c.userId,
			endpoint: parsed.data.endpoint,
			p256dh: parsed.data.p256dh,
			auth: parsed.data.auth,
			label: parsed.data.label ?? null,
		});
		return r.ok
			? { result: null, audit: r.audit }
			: { result: r.error, audit: [] };
	});
	if (res) return { ok: false, error: `push_${res}` };
	revalidatePath(PATH);
	return { ok: true, data: undefined };
}

async function removePushSubscriptionImpl(id: unknown): Promise<ActionResult> {
	const c = await requireOrg(undefined, { employees: true });
	const parsed = z.uuid().safeParse(id);
	if (!parsed.success) return { ok: false, error: "notFound" };
	const found = await mutateOrg(toOrgCtx(c), async (tx) => {
		const audit = await removeDevice(tx, c.orgId, c.userId, parsed.data);
		return { result: Boolean(audit), audit: audit ?? [] };
	});
	if (!found) return { ok: false, error: "notFound" };
	revalidatePath(PATH);
	return { ok: true, data: undefined };
}

// Testhinweis an alle eigenen Geräte, sofort (ohne Job)
async function sendPushTestImpl(): Promise<
	ActionResult<{ sent: number; failed: number }>
> {
	const c = await requireOrg(undefined, { employees: true });
	if (!(await notImpersonating())) return { ok: false, error: "forbidden" };
	const keys = pushConfig();
	if (!keys) return { ok: false, error: "push_not_configured" };
	if (!testLimiter.check(`${c.orgId}:${c.userId}`).allowed)
		return { ok: false, error: "rate_limited" };
	const devices = await readOrg(toOrgCtx(c), (tx) =>
		tx
			.select()
			.from(pushSubscriptions)
			.where(
				and(
					eq(pushSubscriptions.organizationId, c.orgId),
					eq(pushSubscriptions.userId, c.userId),
				),
			),
	);
	if (devices.length === 0) return { ok: false, error: "push_no_device" };
	const send = webPushSender(keys);
	const now = new Date();
	const results = await Promise.all(
		devices.map(async (d) => ({
			id: d.id,
			r: await send(
				{ endpoint: d.endpoint, p256dh: d.p256dh, auth: d.auth },
				{
					title: "Testhinweis aus Klick",
					url: "/einstellungen?tab=notifications",
					tag: "klick-test",
				},
				{ urgency: "high" },
			),
		})),
	);
	await mutateOrg(toOrgCtx(c), async (tx) => {
		for (const { id, r } of results) {
			if (r.ok)
				await tx
					.update(pushSubscriptions)
					.set({ lastSuccessAt: now, lastError: null })
					.where(eq(pushSubscriptions.id, id));
			else if (r.error === "gone" || r.error === "host_not_allowed")
				await tx.delete(pushSubscriptions).where(eq(pushSubscriptions.id, id));
			else
				await tx
					.update(pushSubscriptions)
					.set({ lastError: r.error })
					.where(eq(pushSubscriptions.id, id));
		}
		return {
			result: null,
			audit: {
				action: "notifications.push_test",
				target: `user:${c.userId}`,
				after: {
					sent: results.filter((x) => x.r.ok).length,
					failed: results.filter((x) => !x.r.ok).length,
				},
			},
		};
	});
	revalidatePath(PATH);
	const sent = results.filter((x) => x.r.ok).length;
	return { ok: true, data: { sent, failed: results.length - sent } };
}

export const savePushSubscription = safeAction(
	"savePushSubscription",
	savePushSubscriptionImpl,
);
export const removePushSubscription = safeAction(
	"removePushSubscription",
	removePushSubscriptionImpl,
);
export const sendPushTest = safeAction("sendPushTest", sendPushTestImpl);
