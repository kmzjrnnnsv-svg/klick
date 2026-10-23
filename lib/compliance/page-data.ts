import { cache } from "react";
import type { OrgContext } from "@/lib/auth/guards";
import { toOrgCtx } from "@/lib/auth/guards";
import { readOrg } from "@/lib/db/with-org";
import { CATALOG_FRAMEWORKS } from "./catalog";
import { type OrgCoverage, orgCoverage } from "./queries";

// Request-weit gecachte Ableitungen für Server Components (React.cache ist
// je Request — kein Cache über Mandanten).

export const getOrgCoverageCached = cache(
	async (ctx: OrgContext): Promise<OrgCoverage | null> =>
		readOrg(toOrgCtx(ctx), (tx) => orgCoverage(tx, ctx.orgId)),
);

export function frameworkNameMap(): Record<string, string> {
	return Object.fromEntries(CATALOG_FRAMEWORKS.map((f) => [f.slug, f.name]));
}

export { shortFrameworkName } from "./framework-names";

export const fmtDate = new Intl.DateTimeFormat("de-DE", {
	dateStyle: "medium",
	timeZone: "Europe/Berlin",
});

export function pct(n: number | null | undefined): string {
	return n === null || n === undefined ? "—" : `${Math.round(n)} %`;
}
