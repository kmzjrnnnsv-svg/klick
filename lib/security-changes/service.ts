import { and, eq, inArray, isNull, lte } from "drizzle-orm";
import { orgSettings, roleAssignments, securityChanges } from "@/db/schema";
import type { SecurityChangeKind } from "@/db/schema/enums";
import type { SecurityChange } from "@/db/schema/security-changes";
import { audit } from "@/lib/audit";
import { type OrgContext, toOrgCtx } from "@/lib/auth/guards";
import { listOrgMembers, listSsoProvidersForOrg } from "@/lib/auth/org";
import { normalizeRole } from "@/lib/auth/session-rules";
import { effectiveAssignment } from "@/lib/compliance/appointments";
import { TOP_MANAGEMENT_FUNCTION } from "@/lib/compliance/top-management";
import { mutateOrg, type OrgTx } from "@/lib/db/with-org";
import { invalidateNetworkPolicy } from "@/lib/net/org-network";
import { notify } from "@/lib/notifications/notify";
import type { ActionResult } from "@/lib/validation/common";
import {
	type ApplyKind,
	canCancelChange,
	canDecideChange,
	changeRoute,
	changeState,
	eligibleDeciders,
	isApplyKind,
	isOpen,
	PERMIT_MS,
	type PermitKind,
} from "./rules";

// Vier-Augen für Sicherheitsänderungen (Härtung A4, ADR-028): Antrag,
// Zustimmung der zweiten Person, Wirkung bzw. Erlaubnis. Regeln pure in
// rules.ts. Aufgerufen nur aus den Actions der betroffenen Änderungen
// (Test security-change-wired) und vom Job security-changes.

const LINK = "/einstellungen?tab=sicherheitsaenderungen";

class FourEyesError extends Error {
	constructor(readonly code: string) {
		super(code);
	}
}

const fail = (e: unknown): ActionResult<never> => {
	if (e instanceof FourEyesError) return { ok: false, error: e.code };
	throw e;
};

/**
 * Wer zustimmen darf: Inhaber:innen und bestellte Geschäftsleitung (inkl.
 * Vertretung), jeweils seit mindestens 24 h (eligibleDeciders).
 */
export async function changeDeciders(
	tx: OrgTx,
	orgId: string,
	now = new Date(),
): Promise<string[]> {
	const owners = (await listOrgMembers(orgId))
		.filter((m) => normalizeRole(m.role) === "owner")
		.map((m) => ({ userId: m.userId, since: m.createdAt }));
	const gl = await tx
		.select({
			userId: roleAssignments.userId,
			deputyUserId: roleAssignments.deputyUserId,
			since: roleAssignments.createdAt,
		})
		.from(roleAssignments)
		.where(
			and(
				eq(roleAssignments.organizationId, orgId),
				eq(roleAssignments.function, TOP_MANAGEMENT_FUNCTION),
				effectiveAssignment(),
			),
		);
	return eligibleDeciders(
		[
			...owners,
			...gl.flatMap((r) =>
				[r.userId, r.deputyUserId]
					.filter((id): id is string => Boolean(id))
					.map((userId) => ({ userId, since: r.since })),
			),
		],
		now,
	);
}

const sameTarget = (targetKey: string | null) =>
	targetKey === null
		? isNull(securityChanges.targetKey)
		: eq(securityChanges.targetKey, targetKey);

async function openOfKind(
	tx: OrgTx,
	orgId: string,
	kind: SecurityChangeKind,
	targetKey: string | null,
	now: Date,
): Promise<SecurityChange[]> {
	const rows = await tx
		.select()
		.from(securityChanges)
		.where(
			and(
				eq(securityChanges.organizationId, orgId),
				eq(securityChanges.kind, kind),
				sameTarget(targetKey),
				inArray(securityChanges.status, ["pending", "waiting", "approved"]),
			),
		);
	return rows.filter((r) => isOpen(r, now));
}

type NewChange = {
	kind: SecurityChangeKind;
	targetKey: string | null;
	summary: string;
	payload?: Record<string, unknown> | null;
	before?: Record<string, unknown> | null;
};

// Neuer Antrag in einer laufenden Transaktion: Weg bestimmen, schreiben,
// benachrichtigen. Das Audit setzt der Aufrufer als letzte Anweisung.
async function insertChange(
	tx: OrgTx,
	c: OrgContext,
	input: NewChange,
	now: Date,
): Promise<SecurityChange> {
	const route = changeRoute(await changeDeciders(tx, c.orgId), c.userId, now);
	const [row] = await tx
		.insert(securityChanges)
		.values({
			organizationId: c.orgId,
			kind: input.kind,
			targetKey: input.targetKey,
			summary: input.summary,
			payload: input.payload ?? null,
			before: input.before ?? null,
			status: route.status,
			requestedBy: c.userId,
			requestedAt: now,
			applyAfter: route.applyAfter,
			permitUntil: route.permitUntil,
		})
		.returning();
	if (!row) throw new Error("security_change insert failed");
	await notify(tx, {
		orgId: c.orgId,
		recipients: route.notify,
		// Wartezeit: auch die anfragende Person bekommt die Mail
		actorUserId: route.status === "waiting" ? null : c.userId,
		kind: "security_change",
		title:
			route.status === "pending"
				? `Zweite Person gefragt: ${input.summary}`
				: `Sicherheitsänderung in 24 Stunden: ${input.summary}`,
		body:
			route.status === "pending"
				? "Eine Sicherheitsänderung wartet auf deine Zustimmung. Sie wirkt erst, wenn eine zweite Person zustimmt."
				: "Niemand außer der anfragenden Person kann zustimmen. Die Änderung wirkt nach 24 Stunden, wenn niemand abbricht. Warst du das nicht, brich sie ab.",
		link: LINK,
		payload: { securityChangeId: row.id },
	});
	return row;
}

const requestedCode = (row: SecurityChange) =>
	row.status === "pending"
		? "four_eyes_requested"
		: isApplyKind(row.kind)
			? "four_eyes_waiting"
			: "four_eyes_waiting_permit";

// ── „wirkt“: Antrag mit neuem Wert ─────────────────────────────────────────

/**
 * Kritische Änderung beantragen statt sofort setzen. Antwort immer
 * `ok: false` mit Code, damit das Formular den Hinweis zeigt (der neue Wert
 * ist noch nicht gespeichert).
 */
export async function requestApplyChange(
	c: OrgContext,
	input: NewChange & { kind: ApplyKind },
): Promise<ActionResult<never>> {
	const now = new Date();
	return mutateOrg<ActionResult<never>>(toOrgCtx(c), async (tx) => {
		const open = await openOfKind(
			tx,
			c.orgId,
			input.kind,
			input.targetKey,
			now,
		);
		if (open.length > 0)
			return { result: { ok: false, error: "four_eyes_pending" }, audit: [] };
		const row = await insertChange(tx, c, input, now);
		return {
			result: { ok: false as const, error: requestedCode(row) },
			audit: {
				action: "security_change.requested",
				target: `security_change:${row.id}`,
				after: {
					kind: row.kind,
					summary: row.summary,
					status: row.status,
					applyAfter: row.applyAfter,
					payload: row.payload,
				},
			},
		};
	});
}

// Wirkung einer „wirkt“-Änderung; veraltet (der Wert hat sich seit dem
// Antrag geändert) → FourEyesError, der Antrag verfällt.
const APPLY_COLUMN = {
	sso_policy: "ssoPolicy",
	dlp_policy: "dlpPolicy",
	network_policy: "networkPolicy",
} as const satisfies Record<ApplyKind, keyof typeof orgSettings.$inferSelect>;

async function applyChange(tx: OrgTx, row: SecurityChange): Promise<void> {
	const kind = row.kind as ApplyKind;
	const column = APPLY_COLUMN[kind];
	const [settings] = await tx
		.select({ current: orgSettings[column] })
		.from(orgSettings)
		.where(eq(orgSettings.organizationId, row.organizationId))
		.limit(1);
	if (
		JSON.stringify(settings?.current ?? null) !==
		JSON.stringify(row.before ?? null)
	)
		throw new FourEyesError("four_eyes_stale");
	const value = row.payload?.value;
	if (!value || typeof value !== "object")
		throw new FourEyesError("four_eyes_stale");
	if (kind === "sso_policy") {
		const next = value as { enforce?: boolean };
		if (
			next.enforce &&
			!(await listSsoProvidersForOrg(row.organizationId)).some(
				(p) => p.domainVerified,
			)
		)
			throw new FourEyesError("sso_enforce_unverified");
	}
	await tx
		.update(orgSettings)
		.set({ [column]: value })
		.where(eq(orgSettings.organizationId, row.organizationId));
	if (kind === "network_policy") invalidateNetworkPolicy(row.organizationId);
}

// ── „erlaubt“: einmalige Erlaubnis für die anfragende Person ──────────────

/**
 * Vor einer erlaubnispflichtigen Aktion: gilt eine Erlaubnis für diese
 * Person, kommt ihre ID zurück; sonst wird beantragt bzw. auf den offenen
 * Antrag verwiesen (Code). Verbraucht nichts — dafür redeemPermit.
 */
export async function checkPermit(
	c: OrgContext,
	input: { kind: PermitKind; targetKey: string | null; summary: string },
): Promise<ActionResult<{ id: string }>> {
	const now = new Date();
	return mutateOrg<ActionResult<{ id: string }>>(toOrgCtx(c), async (tx) => {
		const open = await openOfKind(
			tx,
			c.orgId,
			input.kind,
			input.targetKey,
			now,
		);
		const mine = open.find(
			(r) => r.requestedBy === c.userId && changeState(r, now) === "permitted",
		);
		if (mine) return { result: { ok: true, data: { id: mine.id } }, audit: [] };
		if (open.length > 0) {
			const waitingMine = open.find(
				(r) => r.requestedBy === c.userId && changeState(r, now) === "waiting",
			);
			return {
				result: {
					ok: false,
					error: waitingMine ? "four_eyes_waiting_permit" : "four_eyes_pending",
				},
				audit: [],
			};
		}
		const row = await insertChange(tx, c, input, now);
		return {
			result: { ok: false as const, error: requestedCode(row) },
			audit: {
				action: "security_change.requested",
				target: `security_change:${row.id}`,
				after: {
					kind: row.kind,
					targetKey: row.targetKey,
					summary: row.summary,
					status: row.status,
					applyAfter: row.applyAfter,
				},
			},
		};
	});
}

/** Erlaubnis einlösen (einmal): vor der Wirkung, mit Zeilensperre. */
export async function redeemPermit(
	c: OrgContext,
	id: string,
): Promise<ActionResult> {
	const now = new Date();
	try {
		return await mutateOrg(toOrgCtx(c), async (tx) => {
			const [row] = await tx
				.select()
				.from(securityChanges)
				.where(
					and(
						eq(securityChanges.id, id),
						eq(securityChanges.organizationId, c.orgId),
					),
				)
				.for("update");
			if (
				!row ||
				row.requestedBy !== c.userId ||
				changeState(row, now) !== "permitted"
			)
				throw new FourEyesError("four_eyes_not_open");
			await tx
				.update(securityChanges)
				.set({ status: "applied", appliedAt: now })
				.where(eq(securityChanges.id, id));
			return {
				result: { ok: true as const, data: undefined },
				audit: {
					action: "security_change.used",
					target: `security_change:${id}`,
					after: { kind: row.kind, targetKey: row.targetKey },
				},
			};
		});
	} catch (e) {
		return fail(e);
	}
}

/** Prüfen und einlösen in einem: für Aktionen ohne eigenen Vorab-Schritt. */
export async function requirePermit(
	c: OrgContext,
	input: { kind: PermitKind; targetKey: string | null; summary: string },
): Promise<ActionResult> {
	const p = await checkPermit(c, input);
	if (!p.ok) return p;
	return redeemPermit(c, p.data.id);
}

// ── Entscheiden, abbrechen ────────────────────────────────────────────────

export async function decideSecurityChange(
	c: OrgContext,
	input: { id: string; approve: boolean; note: string | null },
): Promise<ActionResult> {
	const now = new Date();
	try {
		const out = await mutateOrg(toOrgCtx(c), async (tx) => {
			const [row] = await tx
				.select()
				.from(securityChanges)
				.where(
					and(
						eq(securityChanges.id, input.id),
						eq(securityChanges.organizationId, c.orgId),
					),
				)
				.for("update");
			if (!row) throw new FourEyesError("not_found");
			const err = canDecideChange(
				row,
				c.userId,
				await changeDeciders(tx, c.orgId),
				now,
			);
			if (err) throw new FourEyesError(err);
			const decided = {
				decidedBy: c.userId,
				decidedAt: now,
				decisionNote: input.note,
			};
			let status: SecurityChange["status"] = "rejected";
			let stale = false;
			if (input.approve && isApplyKind(row.kind)) {
				// Wirkung im Savepoint: veraltet → Antrag verfällt, Rest bleibt
				try {
					await tx.transaction(async (sp) => applyChange(sp, row));
					status = "applied";
				} catch (e) {
					if (!(e instanceof FourEyesError)) throw e;
					status = "expired";
					stale = true;
				}
			} else if (input.approve) status = "approved";
			await tx
				.update(securityChanges)
				.set({
					...decided,
					status,
					appliedAt: status === "applied" ? now : null,
					permitUntil:
						status === "approved"
							? new Date(now.getTime() + PERMIT_MS)
							: row.permitUntil,
				})
				.where(eq(securityChanges.id, row.id));
			await notify(tx, {
				orgId: c.orgId,
				recipients: [row.requestedBy],
				actorUserId: c.userId,
				kind: "security_change",
				title: stale
					? `Verfallen, weil inzwischen geändert: ${row.summary}`
					: status === "rejected"
						? `Abgelehnt: ${row.summary}`
						: status === "applied"
							? `Zugestimmt und wirksam: ${row.summary}`
							: `Zugestimmt, du kannst es 24 Stunden lang ausführen: ${row.summary}`,
				body: input.note ?? undefined,
				link: LINK,
				payload: { securityChangeId: row.id },
			});
			return {
				result: { stale },
				audit: {
					action:
						status === "rejected"
							? "security_change.rejected"
							: status === "expired"
								? "security_change.stale"
								: status === "applied"
									? "security_change.applied"
									: "security_change.approved",
					target: `security_change:${row.id}`,
					before: { status: row.status },
					after: {
						status,
						kind: row.kind,
						note: input.note,
						...(status === "applied" ? { value: row.payload } : {}),
					},
				},
			};
		});
		return out.stale
			? { ok: false, error: "four_eyes_stale" }
			: { ok: true, data: undefined };
	} catch (e) {
		return fail(e);
	}
}

export async function cancelSecurityChange(
	c: OrgContext,
	id: string,
): Promise<ActionResult> {
	const now = new Date();
	try {
		return await mutateOrg(toOrgCtx(c), async (tx) => {
			const [row] = await tx
				.select()
				.from(securityChanges)
				.where(
					and(
						eq(securityChanges.id, id),
						eq(securityChanges.organizationId, c.orgId),
					),
				)
				.for("update");
			if (!row) throw new FourEyesError("not_found");
			const err = canCancelChange(
				row,
				c.userId,
				await changeDeciders(tx, c.orgId),
				now,
			);
			if (err) throw new FourEyesError(err);
			await tx
				.update(securityChanges)
				.set({ status: "cancelled", cancelledBy: c.userId, cancelledAt: now })
				.where(eq(securityChanges.id, id));
			await notify(tx, {
				orgId: c.orgId,
				recipients: [row.requestedBy],
				actorUserId: c.userId,
				kind: "security_change",
				title: `Abgebrochen: ${row.summary}`,
				link: LINK,
				payload: { securityChangeId: row.id },
			});
			return {
				result: { ok: true as const, data: undefined },
				audit: {
					action: "security_change.cancelled",
					target: `security_change:${id}`,
					before: { status: row.status },
					after: { status: "cancelled", kind: row.kind },
				},
			};
		});
	} catch (e) {
		return fail(e);
	}
}

// ── Job: Wartezeit vorbei → „wirkt“-Änderungen setzen ─────────────────────

/** Fällige Änderungen einer Org (Job security-changes, Akteur System). */
export async function applyDueChanges(
	tx: OrgTx,
	orgId: string,
	now: Date,
): Promise<number> {
	const due = await tx
		.select()
		.from(securityChanges)
		.where(
			and(
				eq(securityChanges.organizationId, orgId),
				eq(securityChanges.status, "waiting"),
				lte(securityChanges.applyAfter, now),
			),
		)
		.for("update");
	let applied = 0;
	for (const row of due) {
		if (changeState(row, now) !== "due") continue;
		let status: "applied" | "expired" = "applied";
		try {
			await tx.transaction(async (sp) => applyChange(sp, row));
		} catch (e) {
			if (!(e instanceof FourEyesError)) throw e;
			status = "expired";
		}
		await tx
			.update(securityChanges)
			.set({ status, appliedAt: status === "applied" ? now : null })
			.where(eq(securityChanges.id, row.id));
		await notify(tx, {
			orgId,
			recipients: [row.requestedBy],
			actorUserId: null,
			kind: "security_change",
			title:
				status === "applied"
					? `Nach Wartezeit wirksam: ${row.summary}`
					: `Verfallen, weil inzwischen geändert: ${row.summary}`,
			link: LINK,
			payload: { securityChangeId: row.id },
		});
		await audit(
			tx,
			{ userId: null },
			{
				organizationId: orgId,
				action:
					status === "applied"
						? "security_change.applied"
						: "security_change.stale",
				target: `security_change:${row.id}`,
				after: {
					status,
					kind: row.kind,
					via: "waiting_period",
					...(status === "applied" ? { value: row.payload } : {}),
				},
			},
		);
		if (status === "applied") applied += 1;
	}
	return applied;
}
