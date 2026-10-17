import { cache } from "react";
import type { OrgContext } from "@/lib/auth/guards";
import { toOrgCtx } from "@/lib/auth/guards";
import { readOrg } from "@/lib/db/with-org";
import { CATALOG_FRAMEWORKS } from "./catalog";
import { deriveJourney, type Journey } from "./journey";
import { type OrgCoverage, orgCoverage } from "./queries";
import { loadJourneyFacts } from "./queries-journey";

// Request-weit gecachte Ableitungen für Server Components (React.cache ist
// je Request — kein Cache über Mandanten).

export const getOrgCoverageCached = cache(
	async (ctx: OrgContext): Promise<OrgCoverage | null> =>
		readOrg(toOrgCtx(ctx), (tx) => orgCoverage(tx, ctx.orgId)),
);

// Etappen der Org (lib/compliance/journey.ts) — /heute, Sidebar-Chip und
// Überblick teilen sich eine Berechnung je Request.
export const getJourneyCached = cache(
	async (ctx: OrgContext): Promise<Journey | null> => {
		const cov = await getOrgCoverageCached(ctx);
		if (!cov) return null;
		const facts = await readOrg(toOrgCtx(ctx), (tx) =>
			loadJourneyFacts(tx, ctx.orgId, cov),
		);
		return deriveJourney(facts);
	},
);

export function frameworkNameMap(): Record<string, string> {
	return Object.fromEntries(CATALOG_FRAMEWORKS.map((f) => [f.slug, f.name]));
}

export function shortFrameworkName(slug: string): string {
	const f = CATALOG_FRAMEWORKS.find((x) => x.slug === slug);
	if (!f) return slug;
	// „ISO/IEC 27001:2022" → „ISO 27001", „DORA — …" → „DORA"
	return (
		f.name.split(" — ")[0]?.replace("ISO/IEC ", "ISO ").replace(":2022", "") ??
		f.name
	);
}

export const fmtDate = new Intl.DateTimeFormat("de-DE", {
	dateStyle: "medium",
	timeZone: "Europe/Berlin",
});

export function pct(n: number | null | undefined): string {
	return n === null || n === undefined ? "—" : `${Math.round(n)} %`;
}
