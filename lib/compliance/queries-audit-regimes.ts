import { eq } from "drizzle-orm";
import { audits, orgSettings } from "@/db/schema";
import type { OrgTx } from "@/lib/db/with-org";
import {
	cycleDates,
	effectiveRegime,
	type OrgAuditSettings,
	type RegisteredAudit,
} from "./audit-follow-up";
import { FRAMEWORK_BY_SLUG } from "./catalog";
import {
	AUDIT_REGIME_BY_FRAMEWORK,
	FOLLOW_UP_CLASS_KEYS,
	regimeFor,
} from "./catalog/audit-regimes";

// Audits & Fristen einer Org: eigene Festlegungen + Audits im Register
export async function loadAuditRegimeContext(
	tx: OrgTx,
	orgId: string,
): Promise<{ settings: OrgAuditSettings; registered: RegisteredAudit[] }> {
	const [[row], rows] = await Promise.all([
		tx
			.select({ auditRegimes: orgSettings.auditRegimes })
			.from(orgSettings)
			.where(eq(orgSettings.organizationId, orgId))
			.limit(1),
		tx
			.select({
				frameworkIds: audits.frameworkIds,
				plannedAt: audits.plannedAt,
				performedAt: audits.performedAt,
				type: audits.type,
				status: audits.status,
			})
			.from(audits)
			.where(eq(audits.organizationId, orgId)),
	]);
	return {
		settings: (row?.auditRegimes ?? {}) as OrgAuditSettings,
		registered: rows.map((a) => ({
			frameworkIds: a.frameworkIds ?? [],
			date: a.performedAt ?? a.plannedAt,
			type: a.type,
			status: a.status,
		})),
	};
}

// Anzeige für Einstellungen → Audits & Fristen (pure)
export function regimeViews(
	frameworks: readonly string[],
	settings: OrgAuditSettings,
	registered: readonly RegisteredAudit[],
	today: string,
) {
	// Rahmenwerke mit eigenem Prüfregime zuerst
	const ordered = [...frameworks].sort(
		(a, b) =>
			Number(AUDIT_REGIME_BY_FRAMEWORK.has(b)) -
			Number(AUDIT_REGIME_BY_FRAMEWORK.has(a)),
	);
	return ordered.map((fw) => {
		const base = regimeFor(fw);
		const eff = effectiveRegime(fw, settings);
		const own = settings[fw];
		const { planned, missing } = cycleDates([fw], settings, today, registered);
		return {
			framework: fw,
			name: FRAMEWORK_BY_SLUG.get(fw)?.name ?? fw,
			label: eff.label,
			source: eff.source,
			cycles: eff.cycles.map((c) => ({
				kind: c.kind,
				label: c.label,
				everyMonths: c.everyMonths,
				defaultMonths:
					base.cycles.find((b) => b.kind === c.kind)?.everyMonths ?? 0,
			})),
			classes: Object.fromEntries(
				FOLLOW_UP_CLASS_KEYS.map((k) => [
					k,
					{
						label: eff.classes[k].label,
						rule: eff.classes[k].rule,
						defaultRule: base.classes[k].rule,
					},
				]),
			) as Record<
				(typeof FOLLOW_UP_CLASS_KEYS)[number],
				{
					label: string;
					rule: (typeof eff.classes)["major"]["rule"];
					defaultRule: (typeof eff.classes)["major"]["rule"];
				}
			>,
			anchors: own?.anchors ?? {},
			custom: Boolean(
				own?.cycles?.length || Object.keys(own?.classes ?? {}).length,
			),
			upcoming: planned.map((p) => ({
				kind: p.kind,
				label: p.label,
				date: p.date,
			})),
			missing: missing.map((m) => m.kind),
		};
	});
}
