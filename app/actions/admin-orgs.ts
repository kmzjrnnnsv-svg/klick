"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { orgSettings } from "@/db/schema";
import { safeAction } from "@/lib/actions/safe";
import { auditPlatform } from "@/lib/audit";
import {
	type ActivationLink,
	createAccount as createAccountService,
} from "@/lib/auth/admin-accounts";
import { requirePlatformAdmin, requirePlatformStepUp } from "@/lib/auth/guards";
import { initializeOrg } from "@/lib/compliance/initialize-org";
import {
	appetiteFromMethod,
	defaultRiskMethod,
} from "@/lib/compliance/risk-method";
import { generateDek, wrapDek } from "@/lib/crypto/envelope";
import {
	accountExists,
	adminOrg,
	adminOrgMembers,
	deleteEmptyOrganization,
	insertOrganization,
} from "@/lib/db/admin-orgs";
import { saveOrgAccount, setOrgSuspension } from "@/lib/db/org-accounts";
import { getPriceGroup } from "@/lib/db/pricing";
import { mutateOrg } from "@/lib/db/with-org";
import { env } from "@/lib/env";
import { logger } from "@/lib/log";
import { PLATFORM_MAIL } from "@/lib/mail/address";
import { sendTransactionalMail } from "@/lib/mail/send";
import { orgResumedEmail, orgSuspendedEmail } from "@/lib/mail/templates";
import { invalidateSuspension } from "@/lib/org/suspension";
import { SETUP_FLAG } from "@/lib/setup/steps";
import {
	adminCreateOrgSchema,
	orgContractSchema,
	suspendOrgSchema,
} from "@/lib/validation/admin";
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

// Organisation anlegen: Zeile, Einstellungen mit eigenem Schlüssel (DEK),
// Vertrag, Preisgruppe und die erste Inhaber:in als Konto mit
// Aktivierungslink (Passkey Pflicht). Die Inhaber:in bestätigt beim ersten
// Einstieg die Nutzungsbedingungen (/zustimmung) und landet in der
// geführten Einrichtung. Scheitert ein Schritt, wird die leere Org gelöscht.
async function createOrganizationByAdminImpl(
	input: unknown,
): Promise<ActionResult<ActivationLink & { orgId: string }>> {
	const a = await requirePlatformStepUp();
	const parsed = adminCreateOrgSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	if (await accountExists(d.ownerEmail))
		return {
			ok: false,
			error: "account_exists",
			fieldErrors: { ownerEmail: ["account_exists"] },
		};
	if (d.priceGroupId && !(await getPriceGroup(d.priceGroupId)))
		return { ok: false, error: "not_found" };
	const orgId = await insertOrganization({ name: d.name, slug: d.slug });
	if (!orgId)
		return {
			ok: false,
			error: "slug_taken",
			fieldErrors: { slug: ["slug_taken"] },
		};
	try {
		const wrapped = await wrapDek(await generateDek());
		const method = defaultRiskMethod([]);
		await mutateOrg(
			{ orgId, userId: a.userId, ip: a.ip, userAgent: a.userAgent },
			async (tx) => {
				const now = new Date();
				await tx.insert(orgSettings).values({
					organizationId: orgId,
					encryptedDek: wrapped.wrapped,
					keyVersion: wrapped.keyVersion,
					riskMethod: method,
					riskAppetite: appetiteFromMethod(method),
					onboardingCompletedAt: now,
					priceGroupId: d.priceGroupId ?? null,
					// Inhaber:in startet in der geführten Einrichtung (D0)
					setupFlags: { [SETUP_FLAG.started]: now.toISOString() },
				});
				const init = await initializeOrg(tx, {
					orgId,
					userId: null,
					frameworks: [],
					sector: "other",
					licenceStage: "0_vorbereitung",
					caspServices: [],
					applyBaseline: false,
				});
				return {
					result: undefined,
					audit: {
						action: "org.created",
						target: `organization:${orgId}`,
						after: {
							name: d.name,
							slug: d.slug,
							via: "platform_admin",
							keyVersion: wrapped.keyVersion,
							init,
						},
					},
				};
			},
		);
		await saveOrgAccount(actor(a), orgId, {
			status: d.status,
			startedAt: d.startedAt,
		});
		const res = await createAccountService(
			{
				email: d.ownerEmail,
				name: d.ownerName,
				organizationId: orgId,
				role: "owner",
				sendMail: d.sendMail,
			},
			a,
			await headers(),
		);
		if (!res.ok) {
			await deleteEmptyOrganization(orgId);
			return res;
		}
		await auditPlatform(actor(a), {
			action: "org.created",
			target: `organization:${orgId}`,
			after: { name: d.name, slug: d.slug, owner: d.ownerEmail },
		});
		revalidatePath("/admin/orgs");
		revalidatePath("/admin/users");
		return { ok: true, data: { ...res.data, orgId } };
	} catch (err) {
		await deleteEmptyOrganization(orgId);
		throw err;
	}
}

export const createOrganizationByAdmin = safeAction(
	"createOrganizationByAdmin",
	createOrganizationByAdminImpl,
);
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
