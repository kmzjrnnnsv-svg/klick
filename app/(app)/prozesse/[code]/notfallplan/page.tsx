import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PlanEditor } from "@/components/bcm/plan-editor";
import { withMessages } from "@/components/i18n/with-messages";
import { MarkdownView } from "@/components/markdown-view";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { allows } from "@/lib/auth/permissions";
import { seedPlan } from "@/lib/bcm/plan";
import { planDocBlocks } from "@/lib/bcm/plan-export";
import { bcmPlanFor } from "@/lib/bcm/plan-queries";
import { isFunctionKey } from "@/lib/compliance/function-key";
import { fmtDate } from "@/lib/compliance/page-data";
import { listMembersForPicker, userNames } from "@/lib/compliance/queries";
import { getProcessByCode } from "@/lib/compliance/queries-p3";
import { readOrg } from "@/lib/db/with-org";
import { renderBlocksMarkdown } from "@/lib/export/doc-model";

// Notfall- und Wiederanlaufplan je Prozess (N3). Ohne Plan ein Vorschlag aus
// Prozess, verantwortlicher Stelle und den verknüpften Assets und
// Dienstleistern; gespeichert wird erst per Klick.
async function ProcessPlanPage({
	params,
}: {
	params: Promise<{ code: string }>;
}) {
	const { code: raw } = await params;
	const code = decodeURIComponent(raw);
	if (!/^P-\d{2,3}$/.test(code)) notFound();
	const ctx = await requireOrgPage({ process: ["read"] });
	const canEdit = allows(ctx, { process: ["update"] });
	const t = await getTranslations("Bcm");
	const tf = await getTranslations("Functions");
	const data = await readOrg(toOrgCtx(ctx), async (tx) => {
		const p = await getProcessByCode(tx, ctx.orgId, code);
		if (!p) return null;
		const [plan, members] = await Promise.all([
			bcmPlanFor(tx, ctx.orgId, p.process.id),
			canEdit ? listMembersForPicker(tx, ctx.orgId) : [],
		]);
		const people = plan
			? await userNames(
					tx,
					[
						...plan.content.alert.map((x) => x.who),
						...plan.content.recovery.map((x) => x.who),
					].filter((x) => x && !x.startsWith("function:")),
				)
			: new Map<string, string>();
		return { ...p, plan, members, people };
	});
	if (!data) notFound();
	const { process: p, plan, raci, assets, providers, members, people } = data;
	// Leseansicht ohne Recht zum Bearbeiten (gleiche Gliederung wie das PDF)
	if (!canEdit && !plan) notFound();
	const a = raci.find((r) => r.raci === "A");
	const accountable = a
		? a.userId
			? a.userId
			: a.function
				? `function:${a.function}`
				: null
		: null;
	const initial =
		plan?.content ??
		seedPlan({
			process: { name: p.name, rtoHours: p.rtoHours },
			accountable,
			assets: assets.map((x) => ({
				id: x.id,
				name: x.name,
				rtoHours: x.rtoHours,
			})),
			providers: providers.map((x) => ({ name: x.name })),
		});
	return (
		<>
			<PageHeader
				back={{
					href: `/prozesse/${encodeURIComponent(p.code)}`,
					label: `${p.code} ${p.name}`,
				}}
				title={t("planTitle")}
				lead={plan ? t("planLead") : t("planLeadSeed")}
				actions={
					plan ? (
						<Badge variant={plan.status === "released" ? "success" : "outline"}>
							{plan.status === "released"
								? t("planStatusReleased", {
										version: plan.version,
										date: plan.releasedAt
											? fmtDate.format(plan.releasedAt)
											: "",
									})
								: t("planStatusDraft")}
						</Badge>
					) : undefined
				}
			/>
			{!canEdit && plan ? (
				<MarkdownView
					source={renderBlocksMarkdown(
						planDocBlocks(plan.content, {
							who: (ref) => {
								if (!ref.startsWith("function:"))
									return people.get(ref) ?? t("planWhoUnknown");
								const key = ref.slice("function:".length);
								if (key.startsWith("role:")) return t("planOwnRole");
								return isFunctionKey(key)
									? tf(key as Parameters<typeof tf>[0])
									: key;
							},
							asset: (id) =>
								assets.find((a) => a.id === id)?.name ?? t("planAssetGone"),
						}),
					)}
				/>
			) : (
				<PlanEditor
					processId={p.id}
					code={p.code}
					initial={initial}
					status={plan?.status ?? null}
					members={members}
					assets={assets.map((x) => ({ id: x.id, name: x.name }))}
					rtoHours={p.rtoHours}
					canExport={allows(ctx, { export: ["create"] })}
				/>
			)}
		</>
	);
}

export default withMessages(ProcessPlanPage, [
	"Bcm",
	"Common",
	"Entity",
	"Functions",
]);
