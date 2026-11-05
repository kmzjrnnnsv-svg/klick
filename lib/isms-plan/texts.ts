import type { getTranslations } from "next-intl/server";
import {
	ISMS_ITEM_BY_KEY,
	type IsmsItem,
	type IsmsRetention,
} from "@/lib/compliance/catalog/isms-programme";
import type { IsmsOff } from "./adjust";
import { basisTimes, fmtDay, fmtRange } from "./format";
import type { IsmsStatus } from "./status";

// Texte zum ISMS-Jahresplan für Seite und Exporte (CSV, PDF): Turnus,
// Prüfaufwand, Umsetzung, Stand, Entfallen, Aufbewahrung. Gemeinsam, damit
// die Exporte dasselbe sagen wie die Seite.

export type IsmsT = Awaited<ReturnType<typeof getTranslations<"IsmsPlan">>>;

export function cadenceText(item: IsmsItem, t: IsmsT): string {
	const parts = [t(`cadence_${item.cadence}`)];
	for (const e of item.events ?? []) parts.push(t(`event_${e}`));
	if (item.beforeReview) parts.push(t("beforeReview"));
	return parts.join(", ");
}

// eigene Anzahl der Org ersetzt die Einheiten der Vorlage
export function reviewText(item: IsmsItem, t: IsmsT, units?: number): string {
	if (item.basis?.length) {
		return item.basis
			.map((b) => {
				const times = basisTimes(
					units !== undefined && b.units !== undefined ? { ...b, units } : b,
				);
				const pt = fmtRange(b.pt);
				return times === 1
					? t("basisOnce", { work: t(`work_${b.work}`), pt })
					: t("basisRun", { work: t(`work_${b.work}`), times, pt });
			})
			.join(" + ");
	}
	if (item.review) return t("reviewPt", { pt: fmtRange(item.review) });
	return item.cadence === "continuous" ? t("reviewNone") : t("notApplicable");
}

export function leadText(item: IsmsItem, t: IsmsT): string {
	if (item.leadWeeks)
		return item.leadWeeks[0] === 1 && item.leadWeeks[1] === 1
			? t("leadOne")
			: t("leadWeeks", { weeks: fmtRange(item.leadWeeks) });
	return item.cadence === "continuous" ? t("leadNone") : t("notApplicable");
}

export function statusText(status: IsmsStatus, t: IsmsT): string {
	const key = `status_${status.code}` as Parameters<IsmsT>[0];
	return t(key, {
		n: status.n ?? 0,
		m: status.m ?? 0,
		date: status.date ? fmtDay(status.date) : "",
	});
}

export function offText(off: IsmsOff, t: IsmsT): string {
	return "reason" in off
		? t("offSelf", { reason: off.reason })
		: t("offVia", { parent: ISMS_ITEM_BY_KEY.get(off.via)?.title ?? "" });
}

export function retentionText(r: IsmsRetention, t: IsmsT): string {
	return t(`retention_${r.kind}`, { years: r.years });
}
