import { and, eq } from "drizzle-orm";
import { member } from "@/db/auth-schema";
import {
	type Document,
	documents,
	documentVersions,
	roleAssignments,
} from "@/db/schema";
import type { AuditInput } from "@/lib/audit";
import { normalizeRole } from "@/lib/auth/session-rules";
import type { OrgTx } from "@/lib/db/with-org";
import { notify } from "@/lib/notifications/notify";
import { addMonthsIso, todayBerlin } from "@/lib/time/berlin";

// Dokument-Lebenslauf für Nutzer:innen: Entwurf → In Prüfung → Gültig →
// Archiviert. „Gültig“ entsteht direkt mit der letzten Freigabe (oder beim
// Einreichen ohne aktiven Workflow durch jemanden mit document:publish) —
// kein zweiter Klick „Veröffentlichen“ mehr.

// Wer gehört zum Verteiler? Leer oder "all" = alle; sonst App-Rolle oder
// Funktion (z. B. "compliance").
export function inDistribution(
	distribution: readonly string[],
	who: { orgRole: string; functions?: readonly string[] },
): boolean {
	if (distribution.length === 0 || distribution.includes("all")) return true;
	if (distribution.includes(normalizeRole(who.orgRole))) return true;
	return (who.functions ?? []).some((f) => distribution.includes(f));
}

// Review-Termin: heute (Berlin) + n Monate, Monatsende geklemmt.
export function nextReviewFrom(months: number, today = todayBerlin()): string {
	return addMonthsIso(today, months);
}

// Mitglieder im Verteiler (für Kenntnisnahme-Benachrichtigung und Quote).
export async function distributionAudience(
	tx: OrgTx,
	orgId: string,
	distribution: readonly string[],
): Promise<string[]> {
	const [members, fns] = await Promise.all([
		tx
			.select({ userId: member.userId, role: member.role })
			.from(member)
			.where(eq(member.organizationId, orgId)),
		tx
			.select({ userId: roleAssignments.userId, fn: roleAssignments.function })
			.from(roleAssignments)
			.where(eq(roleAssignments.organizationId, orgId)),
	]);
	return members
		.filter((m) =>
			inDistribution(distribution, {
				orgRole: m.role,
				functions: fns.filter((f) => f.userId === m.userId).map((f) => f.fn),
			}),
		)
		.map((m) => m.userId);
}

// Gültig setzen: Status, Gültig-ab, nächster Review, Veröffentlichung der
// Version, Kenntnisnahme an den Verteiler. Liefert den Audit-Eintrag (der
// Aufrufer schreibt ihn als letzte Anweisung seiner Transaktion).
export async function publishDocument(
	tx: OrgTx,
	ctx: { orgId: string; userId: string },
	doc: Pick<
		Document,
		| "id"
		| "docNumber"
		| "title"
		| "version"
		| "status"
		| "reviewCycleMonths"
		| "distribution"
	>,
	reason: "approval" | "direct" | "legacy",
): Promise<AuditInput> {
	await tx
		.update(documents)
		.set({
			status: "published",
			effectiveFrom: todayBerlin(),
			nextReviewAt: nextReviewFrom(doc.reviewCycleMonths),
		})
		.where(eq(documents.id, doc.id));
	await tx
		.update(documentVersions)
		.set({ publishedAt: new Date() })
		.where(
			and(
				eq(documentVersions.documentId, doc.id),
				eq(documentVersions.version, doc.version),
			),
		);
	await notify(tx, {
		orgId: ctx.orgId,
		recipients: await distributionAudience(tx, ctx.orgId, doc.distribution),
		actorUserId: ctx.userId,
		kind: "acknowledgement_due",
		title: `Zur Kenntnis nehmen: ${doc.docNumber} ${doc.title} v${doc.version}`,
		link: `/dokumente/${encodeURIComponent(doc.docNumber)}`,
	});
	return {
		action: "document.published",
		target: `document:${doc.id}`,
		before: { status: doc.status },
		after: { status: "published", version: doc.version, reason },
	};
}
