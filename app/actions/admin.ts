"use server";

import { APIError } from "better-auth/api";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { auth } from "@/lib/auth/server";
import { runVerifyAuditChain } from "@/lib/jobs/register";
import type { ActionResult } from "@/lib/validation/common";

// Plattform-Admin: Nutzer sperren/entsperren, Rollen setzen (Better-Auth-
// Admin-Plugin; Audit über hooks.after in lib/auth/audit-events.ts) und
// Audit-Kette prüfen.

function mapError(e: unknown): ActionResult<never> {
	if (e instanceof APIError) return { ok: false, error: e.message };
	throw e;
}

export async function banUser(
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

export async function unbanUser(userId: string): Promise<ActionResult> {
	await requirePlatformAdmin();
	try {
		await auth.api.unbanUser({ body: { userId }, headers: await headers() });
		revalidatePath("/admin/users");
		return { ok: true, data: undefined };
	} catch (e) {
		return mapError(e);
	}
}

export async function setPlatformRole(
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

export async function verifyAuditChainAction(): Promise<
	ActionResult<{ checked: number; broken: string[] }>
> {
	await requirePlatformAdmin();
	const result = await runVerifyAuditChain();
	revalidatePath("/admin/audit");
	return { ok: true, data: result };
}
