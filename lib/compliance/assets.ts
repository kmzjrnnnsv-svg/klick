// Asset-Lebenszyklus (B2): Herstellerende, Ende der Sicherheitsupdates,
// Wartung, letzter Patch → Ampel mit Begründung. Pure, getestet
// (tests/assets-lifecycle.test.ts). Termine im Tick (collectDueItems) und
// als Risikovorschlag (risk-proposals.ts).

export type AssetLifecycleInput = {
	type?: string | null;
	status?: string | null;
	endOfLifeAt?: string | null;
	supportEndAt?: string | null;
	maintenance?: "contract" | "internal" | "none" | null;
	maintenanceUntil?: string | null;
	lastPatchedAt?: string | null;
};

export type AssetLifecycleState =
	| "expired"
	| "no_maintenance"
	| "stale_patch"
	| "soon"
	| "ok"
	| "unknown";

export const LIFECYCLE_SOON_DAYS = 180;
export const PATCH_MAX_DAYS = 90;
// Patchstand zählt nur für Technik, die gepatcht wird
const PATCHABLE = new Set(["system", "application", "device", "service"]);

const DAY = 86_400_000;
const fmt = (iso: string) => {
	const [y, m, d] = iso.split("-");
	return `${d}.${m}.${y}`;
};
const days = (iso: string, today: Date) =>
	Math.floor((Date.parse(`${iso}T00:00:00Z`) - today.getTime()) / DAY);

export function assetLifecycle(
	a: AssetLifecycleInput,
	today: Date,
): { state: AssetLifecycleState; reasons: string[]; nextDate: string | null } {
	if (a.status === "retired")
		return { state: "ok", reasons: [], nextDate: null };
	const deadlines = [
		{ at: a.endOfLifeAt, label: "Herstellerende" },
		{ at: a.supportEndAt, label: "Ende der Sicherheitsupdates" },
		{
			at: a.maintenance === "none" ? null : a.maintenanceUntil,
			label: "Wartungsende",
		},
	].filter((d): d is { at: string; label: string } => Boolean(d.at));

	const expired = deadlines.filter((d) => days(d.at, today) < 0);
	const soon = deadlines.filter(
		(d) => days(d.at, today) >= 0 && days(d.at, today) <= LIFECYCLE_SOON_DAYS,
	);
	const upcoming = deadlines
		.filter((d) => days(d.at, today) >= 0)
		.map((d) => d.at)
		.sort();
	const nextDate = upcoming[0] ?? null;

	const reasons: string[] = [];
	for (const d of expired)
		reasons.push(`${d.label} ${fmt(d.at)} überschritten`);
	if (a.maintenance === "none") reasons.push("keine Wartung");
	const patchable = PATCHABLE.has(a.type ?? "system");
	const patchAge =
		patchable && a.lastPatchedAt ? -days(a.lastPatchedAt, today) : null;
	if (patchAge !== null && patchAge > PATCH_MAX_DAYS)
		reasons.push(`letzter Patch vor ${patchAge} Tagen`);
	for (const d of soon) reasons.push(`${d.label} am ${fmt(d.at)}`);

	const state: AssetLifecycleState =
		expired.length > 0
			? "expired"
			: a.maintenance === "none"
				? "no_maintenance"
				: patchAge !== null && patchAge > PATCH_MAX_DAYS
					? "stale_patch"
					: soon.length > 0
						? "soon"
						: deadlines.length === 0 && !a.maintenance && !a.lastPatchedAt
							? "unknown"
							: "ok";
	return { state, reasons, nextDate };
}

// Ampel für Listen: rot = abgelaufen/keine Wartung, gelb = bald/Patch alt
export function lifecycleTone(
	state: AssetLifecycleState,
): "destructive" | "warning" | "success" | "muted" {
	if (state === "expired" || state === "no_maintenance") return "destructive";
	if (state === "stale_patch" || state === "soon") return "warning";
	return state === "ok" ? "success" : "muted";
}
