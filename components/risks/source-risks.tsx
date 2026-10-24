import { Plus } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Section } from "@/components/entity/entity-layout";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { type OrgContext, toOrgCtx } from "@/lib/auth/guards";
import { allows } from "@/lib/auth/permissions";
import {
	catalogId,
	listRisksBySource,
	type SourceRisk,
} from "@/lib/compliance/queries-risk-sources";
import {
	newRiskHref,
	type RiskSourceKind,
} from "@/lib/compliance/risk-sources";
import { readOrg } from "@/lib/db/with-org";

// Risiken zu einer Quelle (B1) mit „Als Risiko erfassen“ — auf den
// Detailseiten von Dienstleister, Asset, Vorfall, Befund, Abweichung, Audit,
// Produkt, Prozess, Control und Anforderung.
export async function SourceRisks({
	kind,
	id,
	risks,
	canCreate,
	compact,
}: {
	kind: RiskSourceKind;
	id: string;
	risks: readonly SourceRisk[];
	canCreate: boolean;
	// nur der Knopf (z. B. in Tabellenzeilen)
	compact?: boolean;
}) {
	const t = await getTranslations("RiskSources");
	const button = canCreate ? (
		<Link
			href={newRiskHref(kind, id)}
			className={buttonVariants({ variant: "outline", size: "sm" })}
		>
			<Plus className="size-3.5" aria-hidden />
			{t("create")}
		</Link>
	) : null;
	if (compact) return button;
	return (
		<Section title={t("title")} actions={button}>
			{risks.length === 0 ? (
				<p className="text-muted-foreground text-subhead">{t("none")}</p>
			) : (
				<ul className="flex flex-col divide-y divide-border/60 text-subhead">
					{risks.map((r) => (
						<li key={r.id} className="flex items-center gap-2 py-1.5">
							<Link
								href={`/risiken/${r.id}`}
								className="min-w-0 truncate hover:underline"
							>
								<span className="whitespace-nowrap font-mono text-muted-foreground text-footnote">
									{r.code}
								</span>{" "}
								{r.title}
							</Link>
							<Badge variant="muted" className="ml-auto shrink-0">
								{t(`status_${r.status}` as "status_open")}
							</Badge>
						</li>
					))}
				</ul>
			)}
		</Section>
	);
}

// Variante für Detailseiten: lädt die Risiken der Quelle selbst.
// Control und Anforderung kommen als Katalog-Schlüssel (Code bzw.
// Rahmenwerk + Code) und werden hier auf die Katalog-ID aufgelöst.
export async function SourceRisksBlock({
	ctx,
	kind,
	id,
	catalogKey,
}: {
	ctx: OrgContext;
	kind: RiskSourceKind;
	id?: string;
	catalogKey?: { controlCode: string } | { slug: string; code: string };
}) {
	if (!allows(ctx, { risk: ["read"] })) return null;
	const loaded = await readOrg(toOrgCtx(ctx), async (tx) => {
		const sourceId =
			id ?? (catalogKey ? await catalogId(tx, catalogKey) : null);
		if (!sourceId) return null;
		return {
			sourceId,
			risks: await listRisksBySource(tx, ctx.orgId, kind, sourceId),
		};
	});
	if (!loaded) return null;
	return (
		<SourceRisks
			kind={kind}
			id={loaded.sourceId}
			risks={loaded.risks}
			canCreate={allows(ctx, { risk: ["create"] })}
		/>
	);
}
