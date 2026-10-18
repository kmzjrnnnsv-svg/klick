"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { safeAction } from "@/lib/actions/safe";
import { auditPlatform } from "@/lib/audit";
import { requireOrg, requirePlatformAdmin, toOrgCtx } from "@/lib/auth/guards";
import { getOrgSummary } from "@/lib/auth/org";
import * as q from "@/lib/db/inquiries";
import { loadPriceTable } from "@/lib/db/pricing";
import { mutateOrg, readOrg } from "@/lib/db/with-org";
import { getOrgSettings } from "@/lib/org/queries";
import { isPriceItemKey } from "@/lib/pricing/items";
import { formatPrice } from "@/lib/pricing/resolve";
import { SlidingWindowLimiter } from "@/lib/rate-limit";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import {
	appInquirySchema,
	inquiryStatusSchema,
} from "@/lib/validation/inquiry";

// Anfragen: „Leistung anfragen“ aus der App (mit Schnappschuss von Org,
// Preisgruppe und Preis) und die Bearbeitung unter Admin → Anfragen.

const perUser = new SlidingWindowLimiter(5, 10 * 60_000);

async function requestServiceImpl(
	input: unknown,
): Promise<ActionResult<{ id: string }>> {
	const ctx = await requireOrg({ settings: ["read"] });
	const parsed = appInquirySchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	if (!perUser.check(ctx.userId).allowed)
		return {
			ok: false,
			error: "Zu viele Anfragen in kurzer Zeit. Versuch es später noch einmal.",
		};
	const d = parsed.data;
	const settings = await readOrg(toOrgCtx(ctx), (tx) =>
		getOrgSettings(tx, ctx.orgId),
	);
	const [org, table] = await Promise.all([
		getOrgSummary(ctx.orgId),
		loadPriceTable(settings?.priceGroupId),
	]);
	const row = await q.insertInquiry({
		source: "app",
		serviceKey: d.service,
		name: ctx.name || ctx.email,
		company: org?.name ?? null,
		email: ctx.email,
		phone: d.phone,
		message: d.message,
		context: {
			orgId: ctx.orgId,
			orgName: org?.name,
			userId: ctx.userId,
			priceGroup: table.group?.name ?? null,
			price: isPriceItemKey(d.service)
				? formatPrice(table.prices[d.service])
				: null,
		},
		ipHash: null,
	});
	await mutateOrg(toOrgCtx(ctx), async () => ({
		result: null,
		audit: {
			action: "inquiry.sent",
			target: `inquiry:${row.id}`,
			after: { service: d.service },
		},
	}));
	return { ok: true, data: { id: row.id } };
}

async function setInquiryStatusImpl(input: unknown): Promise<ActionResult> {
	const admin = await requirePlatformAdmin();
	const parsed = inquiryStatusSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const before = await q.getInquiry(parsed.data.id);
	if (!before) return { ok: false, error: "Anfrage nicht gefunden" };
	await q.setInquiryStatus(parsed.data.id, parsed.data.status, admin.userId);
	await auditPlatform(
		{ userId: admin.userId, ip: admin.ip, userAgent: admin.userAgent },
		{
			action: "inquiry.status_changed",
			target: `inquiry:${before.id}`,
			before: { status: before.status },
			after: { status: parsed.data.status },
		},
	);
	revalidatePath("/admin/anfragen");
	return { ok: true, data: undefined };
}

async function deleteInquiryImpl(id: string): Promise<ActionResult> {
	const admin = await requirePlatformAdmin();
	if (!z.uuid().safeParse(id).success)
		return { ok: false, error: "Anfrage nicht gefunden" };
	const before = await q.getInquiry(id);
	if (!before) return { ok: false, error: "Anfrage nicht gefunden" };
	await q.deleteInquiry(id);
	// Audit ohne Kontaktdaten: nur Art, Herkunft und Status.
	await auditPlatform(
		{ userId: admin.userId, ip: admin.ip, userAgent: admin.userAgent },
		{
			action: "inquiry.deleted",
			target: `inquiry:${id}`,
			before: {
				source: before.source,
				serviceKey: before.serviceKey,
				status: before.status,
			},
		},
	);
	revalidatePath("/admin/anfragen");
	return { ok: true, data: undefined };
}

export const requestService = safeAction("requestService", requestServiceImpl);
export const setInquiryStatus = safeAction(
	"setInquiryStatus",
	setInquiryStatusImpl,
);
export const deleteInquiry = safeAction("deleteInquiry", deleteInquiryImpl);
