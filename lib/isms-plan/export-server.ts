import { getTranslations } from "next-intl/server";
import type { OrgContext } from "@/lib/auth/guards";
import { toOrgCtx } from "@/lib/auth/guards";
import { readOrg } from "@/lib/db/with-org";
import type { IsmsExportLabels } from "./export";
import { loadIsmsFacts, loadIsmsPlanSettings } from "./facts";
import {
	cadenceText,
	leadText,
	offText,
	retentionText,
	reviewText,
	statusText,
} from "./texts";
import { buildIsmsPlanView, type IsmsPlanView } from "./view";

// Daten und Texte für die Exporte des ISMS-Jahresplans (P2c): dasselbe Modell
// wie die Seite, Texte aus den Übersetzungen.

export async function loadIsmsPlanView(ctx: OrgContext): Promise<IsmsPlanView> {
	const { facts, settings } = await readOrg(toOrgCtx(ctx), async (tx) => ({
		facts: await loadIsmsFacts(tx, ctx.orgId),
		settings: await loadIsmsPlanSettings(tx, ctx.orgId),
	}));
	return buildIsmsPlanView(settings, facts);
}

export async function ismsExportLabels(): Promise<IsmsExportLabels> {
	const t = await getTranslations("IsmsPlan");
	const tf = await getTranslations("Functions");
	return {
		section: (s) => t(`section_${s}`),
		cadence: (item) => cadenceText(item, t),
		review: (item, units) => reviewText(item, t, units),
		lead: (item) => leadText(item, t),
		state: (row) =>
			row.off || !row.status ? t("stateOff") : t(`state_${row.status.state}`),
		statusText: (row) =>
			row.off
				? offText(row.off, t)
				: row.status
					? statusText(row.status, t)
					: "",
		owner: (item) => tf(item.owner),
		retention: (r) => retentionText(r, t),
	};
}
