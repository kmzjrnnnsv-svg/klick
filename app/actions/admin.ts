"use server";

import { APIError } from "better-auth/api";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { safeAction } from "@/lib/actions/safe";
import {
	type ActivationLink,
	createAccount as createAccountService,
	renewActivationLink as renewActivationLinkService,
	withdrawAccount as withdrawAccountService,
} from "@/lib/auth/admin-accounts";
import { requirePlatformAdmin, requirePlatformStepUp } from "@/lib/auth/guards";
import { findResetTarget, resetUserAccess } from "@/lib/auth/recover";
import { auth } from "@/lib/auth/server";
import { runVerifyAuditChain } from "@/lib/jobs/register";
import { createAccountSchema } from "@/lib/validation/admin";
import { type ActionResult, fromZod } from "@/lib/validation/common";

// Plattform-Admin: Konten anlegen (Aktivierungslink mit Pflicht-Passkey),
// Nutzer sperren/entsperren, Rollen setzen (Better-Auth-Admin-Plugin; Audit
// über hooks.after in lib/auth/audit-events.ts) und Audit-Kette prüfen.

function mapError(e: unknown): ActionResult<never> {
	if (e instanceof APIError) return { ok: false, error: e.message };
	throw e;
}

async function banUserImpl(
	userId: string,
	reason: string,
): Promise<ActionResult> {
	await requirePlatformAdmin();
	try {
		await auth.api.banUser({
			body: { userId, banReason: reason || "Gesperrt durch Plattform-Admin" },
			headers: await headers(),
		});
		revalidatePath("/admin/users");
		return { ok: true, data: undefined };
	} catch (e) {
		return mapError(e);
	}
}

// Zugang zurücksetzen (ADR-019): alle Faktoren und Sitzungen weg, Einmal-
// Link für einen neuen Passkey. Nie das eigene Konto (dafür Einstellungen).
async function resetUserAccessImpl(
	userId: string,
): Promise<ActionResult<{ url: string }>> {
	const a = await requirePlatformStepUp();
	if (userId === a.userId) return { ok: false, error: "forbidden" };
	const target = await findResetTarget(userId);
	if (!target) return { ok: false, error: "not_found" };
	const { url } = await resetUserAccess({
		target,
		actor: {
			userId: a.userId,
			label: "Der Klick-Support",
			ip: a.ip,
			userAgent: a.userAgent,
		},
		via: "platform_admin",
	});
	revalidatePath("/admin/users");
	return { ok: true, data: { url } };
}

// Konto anlegen: Link zum Kopieren, Mail optional. Step-up, weil daraus
// ein Zugang (ggf. mit Org-Rolle) entsteht.
async function createAccountImpl(
	input: unknown,
): Promise<ActionResult<ActivationLink>> {
	const a = await requirePlatformStepUp();
	const parsed = createAccountSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	try {
		const res = await createAccountService(parsed.data, a, await headers());
		if (res.ok) revalidatePath("/admin/users");
		return res;
	} catch (e) {
		return mapError(e);
	}
}

async function renewActivationLinkImpl(
	userId: string,
	sendMail: boolean,
): Promise<ActionResult<ActivationLink>> {
	const a = await requirePlatformStepUp();
	const res = await renewActivationLinkService(userId, Boolean(sendMail), a);
	if (res.ok) revalidatePath("/admin/users");
	return res;
}

async function withdrawAccountImpl(userId: string): Promise<ActionResult> {
	await requirePlatformStepUp();
	try {
		const res = await withdrawAccountService(userId, await headers());
		if (res.ok) revalidatePath("/admin/users");
		return res;
	} catch (e) {
		return mapError(e);
	}
}

async function unbanUserImpl(userId: string): Promise<ActionResult> {
	await requirePlatformAdmin();
	try {
		await auth.api.unbanUser({ body: { userId }, headers: await headers() });
		revalidatePath("/admin/users");
		return { ok: true, data: undefined };
	} catch (e) {
		return mapError(e);
	}
}

async function setPlatformRoleImpl(
	userId: string,
	role: "admin" | "user",
): Promise<ActionResult> {
	await requirePlatformAdmin();
	try {
		await auth.api.setRole({
			body: { userId, role },
			headers: await headers(),
		});
		revalidatePath("/admin/users");
		return { ok: true, data: undefined };
	} catch (e) {
		return mapError(e);
	}
}

async function verifyAuditChainActionImpl(): Promise<
	ActionResult<{ checked: number; broken: string[] }>
> {
	await requirePlatformAdmin();
	const result = await runVerifyAuditChain();
	revalidatePath("/admin/audit");
	return { ok: true, data: result };
}

// Sicherheitsnetz: unerwartete Ausnahmen → { ok: false, error, ref } + Log
// statt Error-Boundary (lib/actions/safe.ts).
export const banUser = safeAction("banUser", banUserImpl);
export const createAccount = safeAction("createAccount", createAccountImpl);
export const renewActivationLink = safeAction(
	"renewActivationLink",
	renewActivationLinkImpl,
);
export const withdrawAccount = safeAction(
	"withdrawAccount",
	withdrawAccountImpl,
);
export const resetUserAccessAdmin = safeAction(
	"resetUserAccessAdmin",
	resetUserAccessImpl,
);
export const unbanUser = safeAction("unbanUser", unbanUserImpl);
export const setPlatformRole = safeAction(
	"setPlatformRole",
	setPlatformRoleImpl,
);
export const verifyAuditChainAction = safeAction(
	"verifyAuditChainAction",
	verifyAuditChainActionImpl,
);
