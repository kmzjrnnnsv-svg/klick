import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
	DeleteDraftButton,
	StartDraft,
} from "@/components/evidence-authoring/start-draft";
import { PageHeader } from "@/components/page-header";
import { BackLink } from "@/components/ui/back-link";
import { Badge } from "@/components/ui/badge";
import { evidenceDrafts } from "@/db/schema";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { allows } from "@/lib/auth/permissions";
import { CONTROL_BY_CODE } from "@/lib/compliance/catalog";
import { fmtDate } from "@/lib/compliance/page-data";
import { userNames } from "@/lib/compliance/queries";
import { readOrg } from "@/lib/db/with-org";
import { suggestTemplate } from "@/lib/evidence-authoring/suggest";
import {
	EVIDENCE_TEMPLATES,
	TEMPLATE_BY_KEY,
	TEMPLATE_GROUPS,
} from "@/lib/evidence-authoring/templates";

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// Nachweise in Klick verfassen: Rohling wählen (aus dem Nachweisbogen mit
// Vorschlag, Control und Titel vorbelegt) und offene Entwürfe der Org.
export default async function AuthoringGalleryPage({
	searchParams,
}: {
	searchParams: Promise<Search>;
}) {
	const ctx = await requireOrgPage({ evidence: ["read"] });
	const t = await getTranslations("Authoring");
	const canCreate = allows(ctx, { evidence: ["create"] });
	const sp = await searchParams;
	const control = one(sp.control);
	const controlCode =
		control && CONTROL_BY_CODE.has(control) ? control : undefined;
	const position = one(sp.position);
	const sheetItem =
		position && /^i-[0-9a-f]{12}$/.test(position) ? position : undefined;
	const hint = one(sp.titel)?.slice(0, 200);
	const fromHint = hint ? suggestTemplate(hint) : null;
	const wanted = one(sp.vorlage);
	const suggestion =
		wanted && TEMPLATE_BY_KEY.has(wanted)
			? { key: wanted, preset: one(sp.liste) ?? null }
			: fromHint;
	const title = hint?.replace(/^\(P\)\s*/, "");

	const { drafts, names } = await readOrg(toOrgCtx(ctx), async (tx) => {
		const drafts = await tx
			.select({
				id: evidenceDrafts.id,
				title: evidenceDrafts.title,
				templateKey: evidenceDrafts.templateKey,
				controlCodes: evidenceDrafts.controlCodes,
				updatedAt: evidenceDrafts.updatedAt,
				updatedByUserId: evidenceDrafts.updatedByUserId,
				supersedesId: evidenceDrafts.supersedesId,
			})
			.from(evidenceDrafts)
			.where(eq(evidenceDrafts.organizationId, ctx.orgId))
			.orderBy(desc(evidenceDrafts.updatedAt));
		return {
			drafts,
			names: await userNames(
				tx,
				drafts.map((d) => d.updatedByUserId),
			),
		};
	});
	const presetsOf = (key: string) =>
		TEMPLATE_BY_KEY.get(key)?.presets?.map((p) => ({
			key: p.key,
			title: p.title,
		}));
	const suggested = suggestion ? TEMPLATE_BY_KEY.get(suggestion.key) : null;

	return (
		<>
			<BackLink
				href={
					controlCode ? `/controls/${controlCode}#nachweisbogen` : "/nachweise"
				}
				label={
					controlCode ? t("backToControl", { code: controlCode }) : t("back")
				}
			/>
			<PageHeader title={t("pageTitle")} lead={t("lead")} />

			{controlCode && (
				<section
					aria-labelledby="au-for"
					className="mb-8 flex flex-col gap-3 rounded-xl bg-primary/8 p-4"
				>
					<h2 id="au-for" className="font-medium">
						{t("forControl", {
							code: controlCode,
							title: CONTROL_BY_CODE.get(controlCode)?.title ?? "",
						})}
					</h2>
					{title && (
						<p className="text-muted-foreground text-subhead">
							{t("forItem", { item: title })}
						</p>
					)}
					{suggested && canCreate ? (
						<div className="flex flex-col gap-2">
							<p className="text-subhead">
								{t("suggested")}{" "}
								<strong className="font-medium">{suggested.title}</strong> —{" "}
								{suggested.purpose}
							</p>
							<StartDraft
								template={suggested.key}
								templateTitle={suggested.title}
								presets={presetsOf(suggested.key)}
								initialPreset={suggestion?.preset}
								controlCode={controlCode}
								sheetItem={sheetItem}
								title={title}
								primary
							/>
						</div>
					) : (
						<p className="text-muted-foreground text-subhead">
							{t("noSuggestion")}
						</p>
					)}
				</section>
			)}

			{drafts.length > 0 && (
				<section
					aria-labelledby="au-drafts"
					className="mb-10 flex flex-col gap-3"
				>
					<h2 id="au-drafts" className="font-semibold text-headline">
						{t("drafts")}
					</h2>
					<ul className="flex flex-col divide-y divide-border/60 overflow-hidden rounded-2xl bg-card">
						{drafts.map((d) => (
							<li
								key={d.id}
								className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-subhead"
							>
								<Link
									href={`/nachweise/verfassen/${d.id}`}
									className="min-w-0 break-words font-medium text-primary hover:underline"
								>
									{d.title}
								</Link>
								<Badge variant="outline">
									{TEMPLATE_BY_KEY.get(d.templateKey)?.title ?? d.templateKey}
								</Badge>
								{d.supersedesId && (
									<Badge variant="outline">{t("newVersionBadge")}</Badge>
								)}
								{d.controlCodes.length > 0 && (
									<span className="font-mono text-muted-foreground text-footnote">
										{d.controlCodes.join(", ")}
									</span>
								)}
								<span className="text-muted-foreground text-footnote">
									{t("updated", {
										date: fmtDate.format(d.updatedAt),
										name:
											(d.updatedByUserId && names.get(d.updatedByUserId)) ||
											"—",
									})}
								</span>
								{canCreate && (
									<span className="ml-auto">
										<DeleteDraftButton id={d.id} title={d.title} />
									</span>
								)}
							</li>
						))}
					</ul>
				</section>
			)}

			<div className="flex flex-col gap-10">
				{TEMPLATE_GROUPS.map((g) => (
					<section
						key={g.key}
						aria-labelledby={`au-g-${g.key}`}
						className="flex flex-col gap-3"
					>
						<h2 id={`au-g-${g.key}`} className="font-semibold text-headline">
							{g.title}
						</h2>
						<ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
							{EVIDENCE_TEMPLATES.filter((x) => x.group === g.key).map((x) => (
								<li
									key={x.key}
									className="flex min-w-0 flex-col gap-2 rounded-2xl bg-card p-4 text-subhead"
								>
									<div className="flex flex-wrap items-start justify-between gap-2">
										<h3 className="min-w-0 font-medium">{x.title}</h3>
										{x.testMethod && (
											<Badge variant="outline" className="shrink-0">
												{t("withTest")}
											</Badge>
										)}
									</div>
									<p className="text-muted-foreground">{x.purpose}</p>
									<p className="text-muted-foreground text-footnote">
										{x.basis}
									</p>
									{canCreate && (
										<div className="mt-auto pt-2">
											<StartDraft
												template={x.key}
												templateTitle={x.title}
												presets={presetsOf(x.key)}
												controlCode={controlCode}
												sheetItem={sheetItem}
												title={title}
											/>
										</div>
									)}
								</li>
							))}
						</ul>
					</section>
				))}
			</div>
		</>
	);
}
