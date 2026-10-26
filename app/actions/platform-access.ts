"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { safeAction } from "@/lib/actions/safe";
import {
	requireOrg,
	requirePlatformAdmin,
	requirePlatformStepUp,
	requireStepUp,
} from "@/lib/auth/guards";
import {
	decidePlatformAccess,
	reportEmergency,
	requestPlatformAccess,
	revokePlatformAccess,
} from "@/lib/platform-access/service";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import {
	platformAccessDecisionSchema,
	platformAccessReportSchema,
	platformAccessRequestSchema,
} from "@/lib/validation/platform-access";

// Lockbox (Härtung A3, ADR-027): Plattform-Zugriff nur mit Freigabe der Org.

// Plattform: Antrag (auch Notfall und Wartezeit) — immer mit Step-up und nur
// aus dem Admin-Netz (requirePlatformAdmin)
async function requestPlatformAccessImpl(
	input: unknown,
): Promise<ActionResult<{ id: string }>> {
	const admin = await requirePlatformStepUp();
	const parsed = platformAccessRequestSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const res = await requestPlatformAccess(admin, parsed.data);
	if (res.ok) revalidatePath("/admin/zugriffe");
	return res;
}

async function reportEmergencyImpl(input: unknown): Promise<ActionResult> {
	const admin = await requirePlatformAdmin();
	const parsed = platformAccessReportSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const res = await reportEmergency(admin, parsed.data);
	if (res.ok) revalidatePath("/admin/zugriffe");
	return res;
}

// Org: freigeben oder ablehnen — Inhaber:in oder Geschäftsleitung, Step-up
async function decidePlatformAccessImpl(input: unknown): Promise<ActionResult> {
	const ctx = await requireStepUp();
	const parsed = platformAccessDecisionSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const res = await decidePlatformAccess(ctx, parsed.data);
	if (res.ok) revalidatePath("/einstellungen");
	return res;
}

// Org: abbrechen bzw. beenden — ohne Step-up (Bremsen muss schnell gehen),
// auch die betroffene Person
async function revokePlatformAccessImpl(id: unknown): Promise<ActionResult> {
	// Mitarbeitende dürfen, wenn es um sie selbst geht (Prüfung im Dienst)
	const ctx = await requireOrg(undefined, { employees: true });
	const parsed = z.uuid().safeParse(id);
	if (!parsed.success) return { ok: false, error: "invalid" };
	const res = await revokePlatformAccess(ctx, parsed.data);
	if (res.ok) revalidatePath("/einstellungen");
	return res;
}

export const requestPlatformAccessAction = safeAction(
	"requestPlatformAccess",
	requestPlatformAccessImpl,
);
export const reportEmergencyAction = safeAction(
	"reportPlatformEmergency",
	reportEmergencyImpl,
);
export const decidePlatformAccessAction = safeAction(
	"decidePlatformAccess",
	decidePlatformAccessImpl,
);
export const revokePlatformAccessAction = safeAction(
	"revokePlatformAccess",
	revokePlatformAccessImpl,
);
