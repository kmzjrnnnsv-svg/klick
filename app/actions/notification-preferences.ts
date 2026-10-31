"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { notificationPreferences } from "@/db/schema";
import { NOTIFICATION_KINDS } from "@/db/schema/enums";
import { NOTIFICATION_CHANNELS } from "@/db/schema/teams";
import { safeAction } from "@/lib/actions/safe";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { mutateOrg } from "@/lib/db/with-org";
import { type ActionResult, fromZod } from "@/lib/validation/common";

// Eigene Benachrichtigungen (Einstellungen > Benachrichtigungen): Kanal je
// Art, Tages-Mail an oder aus. Jede Person nur für sich, auch Mitarbeitende.

const prefsSchema = z.object({
	channels: z.partialRecord(
		z.enum(NOTIFICATION_KINDS),
		z.enum(NOTIFICATION_CHANNELS),
	),
	digestEnabled: z.boolean(),
});

async function saveNotificationPreferencesImpl(
	input: unknown,
): Promise<ActionResult> {
	const c = await requireOrg(undefined, { employees: true });
	const parsed = prefsSchema.safeParse(input);
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
