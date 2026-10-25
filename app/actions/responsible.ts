"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { documents, evidence } from "@/db/schema";
import { safeAction } from "@/lib/actions/safe";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { ownerColumns } from "@/lib/compliance/function-holders-service";
import { mutateOrg } from "@/lib/db/with-org";
import { notify } from "@/lib/notifications/notify";
import { type ActionResult, fromZod, uuid } from "@/lib/validation/common";
import { responsibleRef } from "@/lib/validation/responsible";

// „Verantwortlich“ auf Detailseiten ohne eigenes Formular (Dokumente,
// Nachweise): Funktion oder Person, sofort gespeichert, mit Audit.
const schema = z.object({
	entity: z.enum(["document", "evidence"]),
	id: uuid,
	ref: responsibleRef,
});

const TARGET = {
	document: {
		table: documents,
		perm: { document: ["update"] },
		path: "/dokumente",
	},
	evidence: {
		table: evidence,
		perm: { evidence: ["create"] },
		path: "/nachweise",
	},
} as const;

async function setResponsibleImpl(input: unknown): Promise<ActionResult> {
	const parsed = schema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { entity, id, ref } = parsed.data;
	const target = TARGET[entity];
	const c = await requireOrg(target.perm);
	const ok = await mutateOrg(toOrgCtx(c), async (tx) => {
		const t = target.table;
		const [before] = await tx
			.select({
				ownerUserId: t.ownerUserId,
				ownerFunction: t.ownerFunction,
				title: t.title,
			})
			.from(t)
			.where(and(eq(t.id, id), eq(t.organizationId, c.orgId)))
			.limit(1);
		if (!before) return { result: false, audit: [] };
		const after = await ownerColumns(tx, c.orgId, ref ?? null, null);
		await tx.update(t).set(after).where(eq(t.id, id));
		if (after.ownerUserId && after.ownerUserId !== before.ownerUserId)
			await notify(tx, {
				orgId: c.orgId,
				recipients: [after.ownerUserId],
				actorUserId: c.userId,
				kind: "task_assigned",
				title: `Du bist jetzt verantwortlich für „${before.title}“`,
				link: entity === "evidence" ? `/nachweise/${id}` : target.path,
			});
		return {
			result: true,
			audit: {
				action: `${entity}.owner_changed`,
				target: `${entity}:${id}`,
				before: {
					ownerUserId: before.ownerUserId,
					ownerFunction: before.ownerFunction,
				},
				after,
			},
		};
	});
	if (!ok) return { ok: false, error: "notFound" };
	revalidatePath(target.path, "layout");
	return { ok: true, data: undefined };
}

export const setResponsible = safeAction("setResponsible", setResponsibleImpl);
