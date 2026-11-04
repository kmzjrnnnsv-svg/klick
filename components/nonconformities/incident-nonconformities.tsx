import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Section } from "@/components/entity/entity-layout";
import { StatusBadge } from "@/components/entity/status-badge";
import { NonconformityForm } from "@/components/nonconformities/nc-forms";
import { type OrgContext, toOrgCtx } from "@/lib/auth/guards";
import { allows } from "@/lib/auth/permissions";
import {
	getOrgCoverageCached,
	shortFrameworkName,
} from "@/lib/compliance/page-data";
import { listMembersForPicker } from "@/lib/compliance/queries";
import { listIncidentNonconformities } from "@/lib/compliance/queries-p3";
import { readOrg } from "@/lib/db/with-org";
import { NONCONFORMITY_STATUS } from "@/lib/entities/nonconformity";

// Abweichungen zu einem Vorfall (CAPA, ISO 27001 10.2, DORA Art. 13):
// automatisch angelegte (schwerwiegend) und von Hand eröffnete, dazu
// „Abweichung eröffnen“ mit Herkunft und Bezug auf den Vorfall.
export async function IncidentNonconformities({
	ctx,
	incident,
}: {
	ctx: OrgContext;
	incident: {
		id: string;
		code: string;
		title: string;
		rootCause: string | null;
	};
}) {
	if (!allows(ctx, { nonconformity: ["read"] })) return null;
	const t = await getTranslations("Nonconformities");
	const ts = await getTranslations("Status");
	// Prüfer:innen legen Abweichungen mit Herkunft „Audit“ an, nicht am Vorfall.
	const canCreate =
		allows(ctx, { nonconformity: ["create"] }) && ctx.orgRole !== "auditor";
	const { rows, members } = await readOrg(toOrgCtx(ctx), async (tx) => ({
		rows: await listIncidentNonconformities(tx, ctx.orgId, incident.id),
		members: canCreate ? await listMembersForPicker(tx, ctx.orgId) : [],
	}));
	const frameworks = canCreate
		? ((await getOrgCoverageCached(ctx))?.frameworks ?? []).map((slug) => ({
				slug,
				name: shortFrameworkName(slug),
			}))
		: [];
	return (
		<Section
			title={t("incidentSection")}
			actions={
				canCreate ? (
					<NonconformityForm
						members={members}
						frameworks={frameworks}
						fromIncident={{
							id: incident.id,
							title: t("fromIncidentTitle", {
								code: incident.code,
								title: incident.title,
							}),
							rootCause: incident.rootCause,
						}}
					/>
				) : null
			}
		>
			{rows.length === 0 ? (
				<p className="text-muted-foreground text-subhead">
					{t("incidentNone")}
				</p>
			) : (
				<ul className="flex flex-col divide-y divide-border/60 text-subhead">
					{rows.map((r) => (
						<li key={r.id} className="flex items-center gap-2 py-1.5">
							<Link
								href={`/abweichungen/${r.id}`}
								className="min-w-0 truncate hover:underline"
							>
								<span className="whitespace-nowrap font-mono text-muted-foreground text-footnote">
									{r.code}
								</span>{" "}
								{r.title}
							</Link>
							<span className="ml-auto shrink-0">
								<StatusBadge
									machine={NONCONFORMITY_STATUS}
									status={r.status}
									label={ts(
										NONCONFORMITY_STATUS.labelKey[r.status] as "ncOpen",
									)}
								/>
							</span>
						</li>
					))}
				</ul>
			)}
		</Section>
	);
}
