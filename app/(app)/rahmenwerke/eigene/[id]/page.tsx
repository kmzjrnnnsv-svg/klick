import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CsvImportDialog } from "@/components/custom-frameworks/csv-import-dialog";
import {
	FrameworkDetailsDialog,
	FrameworkStatusActions,
	SectionDialog,
} from "@/components/custom-frameworks/framework-actions";
import { STATUS_TONE } from "@/components/custom-frameworks/framework-list";
import { RequirementEditor } from "@/components/custom-frameworks/requirement-editor";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ListRow, ListSection } from "@/components/ui/list";
import { requireOrgPage } from "@/lib/auth/gates";
import { toOrgCtx } from "@/lib/auth/guards";
import { allows } from "@/lib/auth/permissions";
import { CONTROLS } from "@/lib/compliance/catalog/controls";
import { shortFrameworkName } from "@/lib/compliance/framework-names";
import { customSlug, naturalCompare } from "@/lib/custom-frameworks/rules";
import { loadCustomFrameworks } from "@/lib/custom-frameworks/service";
import { readOrg } from "@/lib/db/with-org";
import { cn } from "@/lib/utils";

type Search = {
	anf?: string;
	neu?: string;
	abschnitt?: string;
	offen?: string;
	import?: string;
};

const hostOf = (url: string) => {
	try {
		return new URL(url).host;
	} catch {
		return url;
	}
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// Editor eines eigenen Rahmenwerks (R4): Angaben, Abschnitte, Anforderungen
// mit Zuordnung zu Klick-Maßnahmen, CSV-Import; Einschalten und Zurückziehen
// nur Inhaber:innen. Die Anforderung öffnet sich über die URL (?anf=, ?neu=1).
export default async function CustomFrameworkPage({
	params,
	searchParams,
}: {
	params: Promise<{ id: string }>;
	searchParams: Promise<Record<keyof Search, string | string[] | undefined>>;
}) {
	const { id } = await params;
	const sp = await searchParams;
	if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
	const ctx = await requireOrgPage({ custom_framework: ["read"] });
	const t = await getTranslations("CustomFrameworks");
	const [full] = await readOrg(toOrgCtx(ctx), (tx) =>
		loadCustomFrameworks(tx, ctx.orgId, {
			ids: [id],
			statuses: ["draft", "active", "retired"],
		}),
	);
	if (!full) notFound();
	const { framework: fw } = full;
	const canEdit =
		allows(ctx, { custom_framework: ["update"] }) && fw.status !== "retired";
	const canStatus = allows(ctx, { settings: ["update"] });
	const onlyOpen = one(sp.offen) === "1";
	const base = `/rahmenwerke/eigene/${fw.id}`;
	const listHref = onlyOpen ? `${base}?offen=1` : base;
	const withParam = (p: string) => `${listHref}${onlyOpen ? "&" : "?"}${p}`;

	const requirements = [...full.requirements].sort(
		(a, b) => a.sortOrder - b.sortOrder || naturalCompare(a.code, b.code),
	);
	const mapped = requirements.filter((r) => r.controls.length > 0).length;
	const open = requirements.filter(
		(r) => r.controls.length === 0 && !r.excluded,
	);
	const shown = onlyOpen ? open : requirements;
	const sections = [...full.sections].sort(
		(a, b) => a.sortOrder - b.sortOrder || naturalCompare(a.code, b.code),
	);
	const known = new Set(sections.map((s) => s.code));
	const orphans = shown.filter((r) => !known.has(r.sectionCode));

	const selectedId = one(sp.anf);
	const selected = selectedId
		? requirements.find((r) => r.id === selectedId)
		: undefined;
	const isNew = one(sp.neu) === "1" && canEdit;
	const controls = CONTROLS.map((c) => ({ code: c.code, title: c.title }));

	const mappingLabel = (r: (typeof requirements)[number]) =>
		r.excluded
			? t("excluded")
			: r.controls.length === 0
				? t("unmapped")
				: t("controlsCount", { n: r.controls.length });
	const statusHint =
		fw.status === "draft"
			? t("draftHint")
			: fw.status === "active"
				? t("activeHint")
				: t("retiredHint");
	const chip = (active: boolean) =>
		cn(
			"inline-flex h-(--control-h-sm) items-center rounded-full px-3 font-medium text-footnote",
			active
				? "bg-primary-fill text-white"
				: "bg-muted text-foreground hover:bg-foreground/12",
		);

	const rows = (items: typeof shown) =>
		items.map((r) => (
			<ListRow
				key={r.id}
				href={withParam(`anf=${r.id}`)}
				title={
					<>
						<span className="whitespace-nowrap font-mono text-footnote">
							{r.code}
						</span>{" "}
						{r.title}
					</>
				}
				value={mappingLabel(r)}
			/>
		));

	return (
		<>
			<PageHeader
				back={{ href: "/einstellungen?tab=frameworks", label: t("backLabel") }}
				title={fw.name}
				lead={fw.description ?? undefined}
				actions={
					canStatus ? (
						<FrameworkStatusActions id={fw.id} status={fw.status} />
					) : undefined
				}
			/>
			<div className="flex flex-col gap-7">
				<div className="flex flex-col gap-2 rounded-2xl bg-card p-4 text-subhead">
					<div className="flex flex-wrap items-center gap-2">
						<Badge variant={STATUS_TONE[fw.status]}>
							{t(`status_${fw.status}`)}
						</Badge>
						<span>{statusHint}</span>
					</div>
					{fw.copiedFrom && (
						<p className="text-footnote text-muted-foreground">
							{t("copiedHint", { name: shortFrameworkName(fw.copiedFrom) })}
						</p>
					)}
					{!canStatus && fw.status !== "active" && (
						<p className="text-footnote text-muted-foreground">
							{t("onlyOwner")}
						</p>
					)}
					{fw.status === "active" && (
						<Link
							href={`/rahmenwerke/${customSlug(fw.key)}`}
							className="w-fit text-primary hover:underline underline-offset-4"
						>
							{t("openInKlick")}
						</Link>
					)}
				</div>

				<ListSection
					title={t("details")}
					actions={
						canEdit ? (
							<FrameworkDetailsDialog
								initial={{
									id: fw.id,
									name: fw.name,
									version: fw.version,
									issuer: fw.issuer,
									description: fw.description,
									sourceUrl: fw.sourceUrl,
									exclusionAllowed: fw.exclusionAllowed,
									exclusionLabel: fw.exclusionLabel,
								}}
							/>
						) : undefined
					}
					footer={fw.origin === "licensed" ? t("licensedHint") : undefined}
				>
					<ListRow title={t("issuer")} value={fw.issuer ?? t("notSet")} />
					<ListRow title={t("version")} value={fw.version ?? t("notSet")} />
					<ListRow title={t("origin")} value={t(`origin_${fw.origin}`)} />
					<ListRow
						title={t("exclusionAllowed")}
						value={
							fw.exclusionAllowed ? (fw.exclusionLabel ?? t("yes")) : t("no")
						}
					/>
					{fw.sourceUrl && (
						<ListRow
							title={t("sourceUrl")}
							value={
								<a
									href={fw.sourceUrl}
									target="_blank"
									rel="noreferrer noopener"
									className="text-primary hover:underline underline-offset-4"
								>
									{hostOf(fw.sourceUrl)}
								</a>
							}
						/>
					)}
				</ListSection>

				<section className="flex flex-col gap-4">
					<div className="flex flex-wrap items-end justify-between gap-3 px-4">
						<div className="flex flex-col gap-0.5">
							<h2 className="font-semibold text-title-3">
								{t("requirementsTitle")}
							</h2>
							<p className="text-footnote text-muted-foreground">
								{t("progress", { mapped, total: requirements.length })}
							</p>
						</div>
						{canEdit && (
							<div className="flex flex-wrap gap-2">
								<Link
									href={withParam("neu=1")}
									scroll={false}
									className={buttonVariants({ size: "sm" })}
								>
									{t("addRequirement")}
								</Link>
								<SectionDialog frameworkId={fw.id} />
								<CsvImportDialog
									frameworkId={fw.id}
									initialOpen={one(sp.import) === "1"}
								/>
							</div>
						)}
					</div>
					{requirements.length > 0 && (
						<nav
							aria-label={t("requirementsTitle")}
							className="flex gap-2 px-4"
						>
							<Link
								href={base}
								aria-current={!onlyOpen ? "page" : undefined}
								className={chip(!onlyOpen)}
							>
								{t("filterAll")}
							</Link>
							<Link
								href={`${base}?offen=1`}
								aria-current={onlyOpen ? "page" : undefined}
								className={chip(onlyOpen)}
							>
								{t("filterOpen", { n: open.length })}
							</Link>
						</nav>
					)}
					{requirements.length === 0 ? (
						<p className="px-4 text-muted-foreground text-subhead">
							{t("noRequirements")}
						</p>
					) : shown.length === 0 ? (
						<p className="px-4 text-muted-foreground text-subhead">
							{t("noOpen")}
						</p>
					) : null}
					{sections.map((s) => {
						const items = shown.filter((r) => r.sectionCode === s.code);
						const all = requirements.filter((r) => r.sectionCode === s.code);
						if (items.length === 0 && (onlyOpen || all.length > 0)) return null;
						return (
							<ListSection
								key={s.code}
								className="[content-visibility:auto]"
								title={`${s.code} · ${s.title}`}
								actions={
									canEdit ? (
										<SectionDialog
											frameworkId={fw.id}
											section={{
												code: s.code,
												title: s.title,
												sortOrder: s.sortOrder,
											}}
											empty={all.length === 0}
										/>
									) : undefined
								}
							>
								{items.length > 0 ? (
									rows(items)
								) : (
									<ListRow subtitle={t("sectionEmpty")} />
								)}
							</ListSection>
						);
					})}
					{orphans.length > 0 && (
						<ListSection title={t("withoutSection")}>
							{rows(orphans)}
						</ListSection>
					)}
				</section>
			</div>
			{(selected || isNew) && (
				<RequirementEditor
					key={selected?.id ?? "neu"}
					frameworkId={fw.id}
					sections={sections.map((s) => ({ code: s.code, title: s.title }))}
					controls={controls}
					requirement={
						selected
							? {
									id: selected.id,
									sectionCode: selected.sectionCode,
									code: selected.code,
									title: selected.title,
									text: selected.text,
									domain: selected.domain,
									guidance: selected.guidance,
									auditQuestions: selected.auditQuestions,
									evidenceHints: selected.evidenceHints,
									excluded: selected.excluded,
									exclusionReason: selected.exclusionReason,
									controls: selected.controls,
								}
							: null
					}
					defaultSection={one(sp.abschnitt)}
					exclusionAllowed={fw.exclusionAllowed}
					canEdit={canEdit}
					closeHref={listHref}
				/>
			)}
		</>
	);
}
