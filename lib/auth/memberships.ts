import { normalizeRole, type OrgRole } from "./session-rules";

// Mehr-Org-Zugang (ADR-018), pure: Ein Konto hat höchstens EINE eigene
// Mitgliedschaft (owner/editor/viewer/auditor) und beliebig viele als
// Berater:in (consultant). Externe Rollen (auditor, consultant) sind
// befristet und sehen vertrauliche Detailbereiche nur mit Grant.

export const ROLE_LABEL: Record<OrgRole, string> = {
	owner: "Inhaber:in",
	editor: "Bearbeiter:in",
	consultant: "Berater:in (extern)",
	viewer: "Lesend",
	auditor: "Prüfer:in",
};

export const roleLabel = (role: string | null | undefined) =>
	ROLE_LABEL[normalizeRole(role)];

export const CONSULTANT_ACCESS_DAYS = 90;
export const AUDITOR_ACCESS_DAYS = 42;

export const isConsultant = (role: string | null | undefined) =>
	normalizeRole(role) === "consultant";

export const isExternal = (role: string | null | undefined) => {
	const r = normalizeRole(role);
	return r === "auditor" || r === "consultant";
};

// Befristung beim Beitritt (afterAcceptInvitation), sonst null.
export function accessDaysFor(role: string | null | undefined): number | null {
	const r = normalizeRole(role);
	if (r === "consultant") return CONSULTANT_ACCESS_DAYS;
	if (r === "auditor") return AUDITOR_ACCESS_DAYS;
	return null;
}

export const primaryMembershipCount = (roles: readonly string[]) =>
	roles.filter((r) => !isConsultant(r)).length;

export type MembershipDecision =
	| { ok: true }
	| { ok: false; reason: "primary_exists" };

export function membershipAllowed(
	existingRoles: readonly string[],
	newRole: string,
): MembershipDecision {
	if (isConsultant(newRole)) return { ok: true };
	return primaryMembershipCount(existingRoles) > 0
		? { ok: false, reason: "primary_exists" }
		: { ok: true };
}

export type MembershipRow = {
	organizationId: string;
	role: string;
	createdAt: Date;
	accessUntil: Date | null;
};

export const membershipExpired = (
	m: Pick<MembershipRow, "accessUntil">,
	now = Date.now(),
) => Boolean(m.accessUntil && m.accessUntil.getTime() < now);

// Aktive Org beim Sitzungsstart: die eigene Mitgliedschaft, sonst die zuletzt
// beigetretene gültige; sind alle abgelaufen, trotzdem eine (der Guard
// meldet dann access_expired und die Auswahlseite greift).
export function pickActiveMembership(
	rows: readonly MembershipRow[],
	now = Date.now(),
): string | null {
	const newestFirst = [...rows].sort(
		(a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
	);
	const valid = newestFirst.filter((m) => !membershipExpired(m, now));
	const primary = (list: readonly MembershipRow[]) =>
		list.find((m) => !isConsultant(m.role));
	return (
		primary(valid)?.organizationId ??
		valid[0]?.organizationId ??
		primary(newestFirst)?.organizationId ??
		newestFirst[0]?.organizationId ??
		null
	);
}

export type { OrgRole };

// Owner dürfen nur Konten zurücksetzen, die ausschließlich zu ihrer Org
// gehören — sonst übernähmen sie über den Link auch Zugänge zu anderen
// Organisationen (Berater:innen) oder ein Plattform-Konto. Pure.
export function ownerMayReset(input: {
	actorUserId: string;
	orgId: string;
	target: { id: string; role: string | null; orgIds: readonly string[] };
}):
	| { ok: true }
	| {
			ok: false;
			reason: "self" | "platform_admin" | "other_orgs" | "not_member";
	  } {
	if (input.target.id === input.actorUserId)
		return { ok: false, reason: "self" };
	if (input.target.role === "admin")
		return { ok: false, reason: "platform_admin" };
	if (!input.target.orgIds.includes(input.orgId))
		return { ok: false, reason: "not_member" };
	if (input.target.orgIds.some((o) => o !== input.orgId))
		return { ok: false, reason: "other_orgs" };
	return { ok: true };
}
