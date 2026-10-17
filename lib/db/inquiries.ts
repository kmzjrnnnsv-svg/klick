import { count, desc, eq, sql } from "drizzle-orm";
import { globalDb } from "@/db";
import { inquiries } from "@/db/schema";
import type { InquiryStatus } from "@/db/schema/enums";
import type { Inquiry } from "@/db/schema/inquiries";
import { inquiryServiceLabel } from "@/lib/inquiries/rules";
import { notifyPlatformAdmins } from "@/lib/notifications/notify";

// Anfragen (Plattform-Tabelle ohne RLS). Speichern + Benachrichtigung der
// Plattform-Admins in einer Transaktion (notifications braucht den
// Plattform-Kontext); Lesen/Ändern nur aus Admin-Seiten und -Actions.

export type NewInquiry = Pick<
	Inquiry,
	| "source"
	| "serviceKey"
	| "name"
	| "company"
	| "email"
	| "phone"
	| "message"
	| "context"
	| "ipHash"
>;

export async function insertInquiry(input: NewInquiry) {
	return globalDb.transaction(async (tx) => {
		await tx.execute(sql`select set_config('app.scope', 'platform', true)`);
		const [row] = await tx
			.insert(inquiries)
			.values({ ...input, consentAt: new Date() })
			.returning({ id: inquiries.id });
		if (!row) throw new Error("inquiry insert failed");
		const who = [input.name, input.company].filter(Boolean).join(", ");
		await notifyPlatformAdmins(tx, {
			kind: "inquiry",
			title: `Neue Anfrage: ${inquiryServiceLabel(input.serviceKey)}`,
			body: `${who}${input.source === "app" ? " (aus der App)" : ""}`,
			link: `/admin/anfragen?id=${row.id}`,
			payload: { inquiryId: row.id, dedupeKey: `inquiry:${row.id}` },
		});
		return row;
	});
}

export async function listInquiries(status?: InquiryStatus) {
	return globalDb
		.select()
		.from(inquiries)
		.where(status ? eq(inquiries.status, status) : undefined)
		.orderBy(desc(inquiries.createdAt))
		.limit(500);
}

export async function inquiryCounts() {
	const rows = await globalDb
		.select({ status: inquiries.status, n: count() })
		.from(inquiries)
		.groupBy(inquiries.status);
	return new Map(rows.map((r) => [r.status, Number(r.n)]));
}

export async function getInquiry(id: string) {
	const [row] = await globalDb
		.select()
		.from(inquiries)
		.where(eq(inquiries.id, id))
		.limit(1);
	return row ?? null;
}

export async function setInquiryStatus(
	id: string,
	status: InquiryStatus,
	userId: string,
) {
	const [row] = await globalDb
		.update(inquiries)
		.set({ status, handledByUserId: userId })
		.where(eq(inquiries.id, id))
		.returning({ id: inquiries.id });
	return Boolean(row);
}

export async function deleteInquiry(id: string) {
	const rows = await globalDb
		.delete(inquiries)
		.where(eq(inquiries.id, id))
		.returning({ id: inquiries.id });
	return rows.length > 0;
}
