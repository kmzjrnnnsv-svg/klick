"use server";

import { revalidatePath } from "next/cache";
import { notificationPreferences } from "@/db/schema";
import { safeAction } from "@/lib/actions/safe";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { mutateOrg } from "@/lib/db/with-org";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import { channelPrefsSchema } from "@/lib/validation/push";

// Eigene Benachrichtigungen (Einstellungen > Benachrichtigungen): Kanäle je
// Art (Mail, Push, Teams, auch mehrere), Tages-Mail an oder aus. Jede Person
// nur für sich, auch Mitarbeitende. Nichts gewählt = Mail (channelSet).

async function saveNotificationPreferencesImpl(
	input: unknown,
): Promise<ActionResult> {
	const c = await requireOrg(undefined, { employees: true });
	const parsed = channelPrefsSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { channels, digestEnabled } = parsed.data;
	await mutateOrg(toOrgCtx(c), async (tx) => {
		await tx
			.insert(notificationPreferences)
			.values({
				organizationId: c.orgId,
				userId: c.userId,
				channels,
				digestEnabled,
				updatedAt: new Date(),
			})
			.onConflictDoUpdate({
				target: [
					notificationPreferences.organizationId,
					notificationPreferences.userId,
				],
				set: { channels, digestEnabled, updatedAt: new Date() },
			});
		return {
			result: null,
			audit: {
				action: "notification_preferences.saved",
				target: `user:${c.userId}`,
				after: { channels, digestEnabled },
			},
		};
	});
	revalidatePath("/einstellungen");
	return { ok: true, data: undefined };
}

export const saveNotificationPreferences = safeAction(
	"saveNotificationPreferences",
	saveNotificationPreferencesImpl,
);
