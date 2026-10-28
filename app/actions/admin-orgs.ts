"use server";

import { revalidatePath } from "next/cache";
import { safeAction } from "@/lib/actions/safe";
import { requirePlatformAdmin, requirePlatformStepUp } from "@/lib/auth/guards";
import { adminOrg, adminOrgMembers } from "@/lib/db/admin-orgs";
import { saveOrgAccount, setOrgSuspension } from "@/lib/db/org-accounts";
import { env } from "@/lib/env";
import { logger } from "@/lib/log";
import { PLATFORM_MAIL } from "@/lib/mail/address";
import { sendTransactionalMail } from "@/lib/mail/send";
import { orgResumedEmail, orgSuspendedEmail } from "@/lib/mail/templates";
import { invalidateSuspension } from "@/lib/org/suspension";
import { orgContractSchema, suspendOrgSchema } from "@/lib/validation/admin";
import { type ActionResult, fromZod } from "@/lib/validation/common";

// Admin > Organisationen (Admin-Portal, Teil 2): Vertrag pflegen, Organisation
// sperren und entsperren. Plattform-Daten über die Kund:in, keine Inhalte
// der Org (Lockbox). Sperren und Entsperren mit Step-up, weil es jede Person
// der Org trifft.

const actor = (a: Awaited<ReturnType<typeof requirePlatformAdmin>>) => ({
	userId: a.userId,
	ip: a.ip,
	userAgent: a.userAgent,
});

async function saveOrgContractImpl(input: unknown): Promise<ActionResult> {
	const a = await requirePlatformAdmin();
	const parsed = orgContractSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { orgId, ...patch } = parsed.data;
	if (!(await adminOrg(orgId))) return { ok: false, error: "not_found" };
	if (patch.status === "cancelled" && !patch.cancelledAt)
		return {
			ok: false,
			error: "cancelled_needs_date",
			fieldErrors: { cancelledAt: ["cancelled_needs_date"] },
		};
	await saveOrgAccount(actor(a), orgId, patch);
	revalidatePath(`/admin/orgs/${orgId}`);
	revalidatePath("/admin/orgs");
	return { ok: true, data: undefined };
}

async function suspendOrganizationImpl(input: unknown): Promise<ActionResult> {
	const a = await requirePlatformStepUp();
	const parsed = suspendOrgSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { orgId, reason } = parsed.data;
	const org = await adminOrg(orgId);
	if (!org) return { ok: false, error: "not_found" };
	// Nie die eigene Organisation: der Betrieb sperrte sich sonst selbst aus
	const members = await adminOrgMembers(orgId);
	if (members.some((m) => m.userId === a.userId))
		return { ok: false, error: "own_org" };
	const out = await setOrgSuspension(actor(a), orgId, {
		suspend: true,
		reason,
	});
	invalidateSuspension(orgId);
	if (out.changed) {
		const mail = orgSuspendedEmail({
			organization: org.name,
			reason,
			contact: PLATFORM_MAIL,
		});
		for (const o of out.owners)
			await sendTransactionalMail({ to: o.email, ...mail }).catch((err) =>
				logger.warn({ err, orgId }, "org suspended: mail failed"),
			);
	}
	revalidatePath(`/admin/orgs/${orgId}`);
	revalidatePath("/admin/orgs");
	return out.changed
		? { ok: true, data: undefined }
		: { ok: false, error: "unchanged" };
}

async function resumeOrganizationImpl(orgId: string): Promise<ActionResult> {
	const a = await requirePlatformStepUp();
	const org = await adminOrg(orgId);
	if (!org) return { ok: false, error: "not_found" };
	const out = await setOrgSuspension(actor(a), orgId, { suspend: false });
	invalidateSuspension(orgId);
	if (out.changed) {
		const mail = orgResumedEmail({
			organization: org.name,
			url: `${env().BETTER_AUTH_URL}/heute`,
		});
		for (const o of out.owners)
			await sendTransactionalMail({ to: o.email, ...mail }).catch((err) =>
				logger.warn({ err, orgId }, "org resumed: mail failed"),
			);
	}
	revalidatePath(`/admin/orgs/${orgId}`);
	revalidatePath("/admin/orgs");
	return out.changed
		? { ok: true, data: undefined }
		: { ok: false, error: "unchanged" };
}

export const saveOrgContract = safeAction(
	"saveOrgContract",
	saveOrgContractImpl,
);
export const suspendOrganization = safeAction(
	"suspendOrganization",
	suspendOrganizationImpl,
);
export const resumeOrganization = safeAction(
	"resumeOrganization",
	resumeOrganizationImpl,
);
