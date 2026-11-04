"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { providers } from "@/db/schema";
import { safeAction } from "@/lib/actions/safe";
import { pendingApprovalIds } from "@/lib/approvals/bar";
import { GateBlocked } from "@/lib/approvals/gate-error";
import { gateApproval } from "@/lib/approvals/service";
import { providerFactsOf } from "@/lib/approvals/triggers";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import {
	functionRecipients,
	ownerColumns,
} from "@/lib/compliance/function-holders-service";
import { mutateOrg } from "@/lib/db/with-org";
import { notify } from "@/lib/notifications/notify";
import { orgOwnerIds } from "@/lib/org/queries";
import { type ActionResult, fromZod } from "@/lib/validation/common";
import {
	providerDetailsSchema,
	providerRequestSchema,
	providerStepSchema,
} from "@/lib/validation/suppliers";

// Lebenszyklus eines Dienstleisters (L1, lib/compliance/supplier-lifecycle.ts):
// Bedarf melden, Bedarf annehmen oder ablehnen, in Betrieb nehmen, Angaben
// zu Auslagerung und Ausstieg ergänzen.

const PATH = "/dienstleister";

class StepError extends Error {
	constructor(readonly code: string) {
		super(code);
	}
}

// Bedarf melden: kurzer Eintrag mit Status „Bedarf“, ohne Freigabe; die
// Auslagerungsbeauftragte (sonst Inhaber:innen) erfährt davon
async function requestProviderImpl(
	input: unknown,
): Promise<ActionResult<{ id: string }>> {
	const c = await requireOrg({ provider: ["create"] });
	const parsed = providerRequestSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	const id = await mutateOrg(toOrgCtx(c), async (tx) => {
		// ohne Auswahl ist die meldende Person verantwortlich
		const owner = await ownerColumns(
			tx,
			c.orgId,
			d.ownerUserId ?? undefined,
			c.userId,
		);
		const [row] = await tx
			.insert(providers)
			.values({
				organizationId: c.orgId,
				name: d.name,
				serviceDescription: d.serviceDescription,
				notes: d.reason || null,
				processesPersonalData: d.processesPersonalData,
				isIct: d.isIct,
				status: "requested",
				...owner,
			})
			.returning({ id: providers.id });
		if (!row) throw new Error("insert failed");
		const officers = await functionRecipients(
			tx,
			c.orgId,
			"outsourcing_officer",
		);
		await notify(tx, {
			orgId: c.orgId,
			recipients: officers.length ? officers : await orgOwnerIds(tx, c.orgId),
			actorUserId: c.userId,
			kind: "entity_changed",
			title: `Neuer Bedarf an einem Dienstleister: ${d.name}`,
			link: `${PATH}/${row.id}`,
		});
		return {
			result: row.id,
			audit: {
				action: "provider.requested",
				target: `provider:${row.id}`,
				after: {
					name: d.name,
					isIct: d.isIct,
					processesPersonalData: d.processesPersonalData,
					ownerUserId: owner.ownerUserId,
					ownerFunction: owner.ownerFunction,
				},
			},
		};
	});
	revalidatePath(PATH);
	return { ok: true, data: { id } };
}

// Nächster Schritt: Bedarf annehmen (Ablauf „Dienstleister aufnehmen“, danach
// im Aufbau), ablehnen (mit Begründung) oder in Betrieb nehmen
async function advanceProviderImpl(
	input: unknown,
): Promise<ActionResult<{ status: string; approvalPending: boolean }>> {
	const c = await requireOrg({ provider: ["update"] });
	const parsed = providerStepSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const d = parsed.data;
	try {
		const res = await mutateOrg(toOrgCtx(c), async (tx) => {
			const [p] = await tx
				.select()
				.from(providers)
				.where(
					and(
						eq(providers.id, d.providerId),
						eq(providers.organizationId, c.orgId),
					),
				)
				.limit(1);
			if (!p) throw new StepError("notFound");
			const waiting = await pendingApprovalIds(tx, c.orgId, "provider", [p.id]);
			if (waiting.size > 0) throw new StepError("statusLocked");
			let status: typeof p.status;
			let approvalPending = false;
			if (d.step === "accept" || d.step === "decline") {
				if (p.status !== "requested") throw new StepError("wrong_stage");
				if (d.step === "decline") status = "declined";
				else {
					const gate = await gateApproval(
						tx,
						{ orgId: c.orgId, userId: c.userId, name: c.name },
						{
							trigger: "provider.create",
							entityType: "provider",
							entityId: p.id,
							entityOwnerUserId: p.ownerUserId,
							title: `Dienstleister aufnehmen: ${p.name}`,
							link: `${PATH}/${p.id}`,
							facts: providerFactsOf(p),
						},
					);
					if (gate.status === "error")
						throw new GateBlocked(gate.error, gate.warnings);
					approvalPending = gate.status === "pending";
					status = "onboarding";
				}
			} else {
				if (p.status !== "onboarding" && p.status !== "paused")
					throw new StepError("wrong_stage");
				status = "active";
			}
			await tx.update(providers).set({ status }).where(eq(providers.id, p.id));
			if (d.step !== "activate")
				await notify(tx, {
					orgId: c.orgId,
					recipients: [p.ownerUserId],
					actorUserId: c.userId,
					kind: "entity_changed",
					title:
						d.step === "accept"
							? `Bedarf angenommen: ${p.name}`
							: `Bedarf abgelehnt: ${p.name}`,
					body: d.step === "decline" ? d.note : undefined,
					link: `${PATH}/${p.id}`,
				});
			return {
				result: { status, approvalPending },
				audit: {
					action:
						d.step === "accept"
							? "provider.request_accepted"
							: d.step === "decline"
								? "provider.request_declined"
								: "provider.activated",
					target: `provider:${p.id}`,
					before: { status: p.status },
					after: { status, ...(d.note ? { note: d.note } : {}) },
				},
			};
		});
		revalidatePath(PATH);
		revalidatePath(`${PATH}/${d.providerId}`);
		return { ok: true, data: res };
	} catch (e) {
		if (e instanceof GateBlocked) return { ok: false, error: e.code };
		if (e instanceof StepError) return { ok: false, error: e.code };
		throw e;
	}
}

// Angaben zu Auslagerung und Ausstieg (DORA Art. 28 Abs. 8, Art. 30;
// DSGVO Art. 28): nur gesendete Felder werden geschrieben
async function updateProviderDetailsImpl(
	input: unknown,
): Promise<ActionResult<{ id: string }>> {
	const c = await requireOrg({ provider: ["update"] });
	const parsed = providerDetailsSchema.safeParse(input);
	if (!parsed.success) return fromZod(parsed.error);
	const { providerId, ...d } = parsed.data;
	const patch = Object.fromEntries(
		Object.entries(d).filter(([, v]) => v !== undefined),
	) as Partial<typeof providers.$inferInsert>;
	if (typeof patch.exitStrategy === "string" && !patch.exitStrategy)
		patch.exitStrategy = null;
	const found = await mutateOrg(toOrgCtx(c), async (tx) => {
		const [before] = await tx
			.select()
			.from(providers)
			.where(
				and(
					eq(providers.id, providerId),
					eq(providers.organizationId, c.orgId),
				),
			)
			.limit(1);
		if (!before) return { result: false, audit: [] };
		if (Object.keys(patch).length > 0)
			await tx.update(providers).set(patch).where(eq(providers.id, providerId));
		return {
			result: true,
			audit: {
				action: "provider.details_updated",
				target: `provider:${providerId}`,
				before: Object.fromEntries(
					Object.keys(patch).map((k) => [
						k,
						(before as Record<string, unknown>)[k] ?? null,
					]),
				),
				after: patch,
			},
		};
	});
	if (!found) return { ok: false, error: "notFound" };
	revalidatePath(`${PATH}/${providerId}`);
	return { ok: true, data: { id: providerId } };
}

export const requestProvider = safeAction(
	"requestProvider",
	requestProviderImpl,
);
export const advanceProvider = safeAction(
	"advanceProvider",
	advanceProviderImpl,
);
export const updateProviderDetails = safeAction(
	"updateProviderDetails",
	updateProviderDetailsImpl,
);
