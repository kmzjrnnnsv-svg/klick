import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Section } from "@/components/entity/entity-layout";
import { Badge } from "@/components/ui/badge";
import type { EntityKind } from "@/db/schema/enums";
import { type OrgContext, toOrgCtx } from "@/lib/auth/guards";
import { allows } from "@/lib/auth/permissions";
import {
	entityFrameworkRefs,
	listDecisionRequests,
	listResolutionsFor,
	managementApproverHint,
} from "@/lib/compliance/decision-service";
import { readOrg } from "@/lib/db/with-org";
import { DecisionRequestButton } from "./decision-request-button";

// Entscheidungen zu einer Entität (E1/E2): Beschlüsse der Geschäftsleitung
// und offene Anfragen, dazu „Entscheidung anfragen“ mit vorbelegtem Bezug.
export async function DecisionRequestsBlock({
	ctx,
	kind,
	id,
	title,
}: {
	ctx: OrgContext;
	kind: EntityKind;
	id: string;
	// Vorschlag für die Frage
	title?: string;
}) {
	const t = await getTranslations("Decisions");
	const data = await readOrg(toOrgCtx(ctx), async (tx) => ({
		requests: await listDecisionRequests(tx, ctx.orgId, { type: kind, id }),
		resolutions: allows(ctx, { resolution: ["read"] })
			? await listResolutionsFor(tx, ctx.orgId, kind, [id])
			: [],
		refs: await entityFrameworkRefs(tx, ctx.orgId, kind, id),
		approverHint: await managementApproverHint(tx, ctx.orgId, ctx.userId),
	}));
	const canAsk = allows(ctx, { decision: ["create"] });
	const empty = data.requests.length === 0 && data.resolutions.length === 0;
	return (
		<Section
			title={t("blockTitle")}
			actions={
				canAsk ? (
					<DecisionRequestButton
						linkedEntityType={kind}
						linkedEntityId={id}
						defaultQuestion={title}
						refs={data.refs}
						approverHint={data.approverHint}
					/>
				) : null
			}
		>
			{empty ? (
				<p className="text-muted-foreground text-subhead">{t("none")}</p>
			) : (
				<ul className="flex flex-col divide-y divide-border/60 text-subhead">
					{data.resolutions.map((r) => (
						<li key={r.id} className="py-1.5">
							<Link href="/beschluesse" className="hover:underline">
								<span className="whitespace-nowrap font-mono text-muted-foreground text-footnote">
									{r.number}
								</span>{" "}
								{r.subject}
							</Link>
							<p className="line-clamp-2 text-muted-foreground text-footnote">
								{r.decisionText}
							</p>
						</li>
					))}
					{data.requests
						.filter((q) => q.status === "open")
						.map((q) => (
							<li key={q.id} className="flex items-center gap-2 py-1.5">
								<Link
									href="/beschluesse?tab=anfragen"
									className="min-w-0 truncate hover:underline"
								>
									<span className="whitespace-nowrap font-mono text-muted-foreground text-footnote">
										{q.code}
									</span>{" "}
									{q.question}
								</Link>
								<Badge variant="warning" className="ml-auto shrink-0">
									{t("status_open")}
								</Badge>
							</li>
						))}
				</ul>
			)}
		</Section>
	);
}
