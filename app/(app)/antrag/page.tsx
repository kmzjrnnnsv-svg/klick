import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ApplicationCheck } from "@/components/casp/application-check";
import { UrlTabs } from "@/components/entity/url-tabs";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { requireOrg, toOrgCtx } from "@/lib/auth/guards";
import { roleAllows } from "@/lib/auth/permissions";
import {
	type ApplicationCheck as Check,
	type CheckStatus,
	evaluateApplication,
} from "@/lib/compliance/application";
import { loadApplicationFacts } from "@/lib/compliance/application-facts";
import { CONTROL_BY_CODE } from "@/lib/compliance/catalog";
import { TEMPLATE_BY_CODE } from "@/lib/compliance/catalog/document-templates";
import { MICAR_APPLICATION } from "@/lib/compliance/catalog/micar-application";
import { ZAG_APPLICATION } from "@/lib/compliance/catalog/zag-application";
import { fmtDate } from "@/lib/compliance/page-data";
import { readOrg } from "@/lib/db/with-org";

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const TONE: Record<
	CheckStatus | "not_applicable",
	"success" | "warning" | "outline" | "muted"
> = {
	done: "success",
	partial: "warning",
	open: "outline",
	not_applicable: "muted",
};

// /antrag — zwei Mappen (MiCAR Art. 62, ZAG § 10): jeder Bestandteil ist mit
// Modulen verknüpft; Vollständigkeit wird aus deren Zustand abgeleitet.
// Nur Unterlagen außerhalb der Plattform werden manuell abgehakt.
export default async function ApplicationPage({
	searchParams,
}: {
	searchParams: Promise<Search>;
}) {
	const ctx = await requireOrg({ organisation: ["read"] });
	const sp = await searchParams;
	const tab = one(sp.tab) === "zag" ? "zag" : "micar";
	const t = await getTranslations("Application");
	const tf = await getTranslations("Functions");
	const canEdit = roleAllows(ctx.orgRole, { organisation: ["update"] });

	const { facts, services, state } = await readOrg(toOrgCtx(ctx), (tx) =>
		loadApplicationFacts(tx, ctx.orgId),
	);

	const items = tab === "zag" ? ZAG_APPLICATION : MICAR_APPLICATION;
	const result = evaluateApplication(items, facts, services);

	const checkLabel = (c: Check): string => {
		switch (c.kind) {
			case "documents":
				return `${t("check_documents")}: ${c.templateCodes
					.map((code) => TEMPLATE_BY_CODE.get(code)?.title ?? code)
					.join(", ")}`;
			case "controls":
				return `${t("check_controls")}: ${c.codes.join(", ")}`;
			case "functions":
				return `${t("check_functions")}: ${c.functions.map((f) => tf(f)).join(", ")}`;
			case "providers":
				return t(
					c.filter === "outsourcing"
						? "check_providers_outsourcing"
						: "check_providers",
				);
			case "processes":
				return t("check_processes", { n: c.min ?? 1 });
			case "scope":
				return t("check_scope", { fw: c.framework });
			case "manual":
				return `${t("check_manual")}: ${c.hint}`;
			default:
				return t(`check_${c.kind}`);
		}
	};
	const checkHref = (c: Check): string | null => {
		switch (c.kind) {
			case "documents":
				return "/dokumente";
			case "controls":
				return `/controls/${c.codes[0]}`;
			case "functions":
				return "/organisation?tab=rollen";
			case "own_funds":
				return "/eigenmittel";
			case "aml_risk_analysis":
				return "/aml?tab=risikoanalyse";
			case "providers":
				return "/dienstleister";
			case "processes":
				return "/prozesse";
			case "shareholders":
				return "/organisation?tab=gesellschafter";
			case "crypto_assets":
				return "/kryptowerte";
			case "scope":
				return "/organisation?tab=geltungsbereich";
			default:
				return null;
		}
	};

	return (
		<>
			<PageHeader
				title={t("title")}
				lead={t("lead")}
				actions={
					<a
						href={`/api/export/antrag.md?mappe=${tab}`}
						className="text-primary text-sm hover:underline underline-offset-4"
					>
						{t("exportMd")}
					</a>
				}
			/>
			<UrlTabs
				base="/antrag"
				active={tab}
				tabs={[
					{ value: "micar", label: t("tabMicar") },
					{ value: "zag", label: t("tabZag") },
				]}
			/>
			<div className="mb-6 grid gap-4 md:grid-cols-[1fr_auto]">
				<div className="flex flex-col gap-2">
					<Progress value={result.completenessPct ?? 0} />
					<p className="text-muted-foreground text-sm">
						{t("summary", {
							done: result.done,
							partial: result.partial,
							open: result.applicable - result.done - result.partial,
							total: result.applicable,
						})}
					</p>
				</div>
				<p className="font-serif-display text-3xl text-primary">
					{result.completenessPct === null
						? "—"
						: `${Math.round(result.completenessPct)} %`}
				</p>
			</div>
			<p className="mb-4 text-muted-foreground text-sm">
				{tab === "micar" ? t("micarLead") : t("zagLead")}
			</p>
			<ol className="flex flex-col gap-3">
				{result.items.map((r, idx) => (
					<li key={r.item.code} className="rounded-md border p-4">
						<div className="flex flex-wrap items-start justify-between gap-3">
							<div className="min-w-0 flex-1">
								<p className="lv-eyebrow text-[0.52rem] text-muted-foreground">
									#{idx + 1} · {r.item.code} · {r.item.legalBasis}
								</p>
								<h2 className="font-medium">{r.item.title}</h2>
								<p className="mt-1 text-muted-foreground text-sm">
									{r.item.description}
								</p>
							</div>
							<div className="flex flex-col items-end gap-1">
								<Badge variant={TONE[r.status]}>
									{t(`status_${r.status}`)}
								</Badge>
								<Link
									href={r.item.route}
									className="text-primary text-xs hover:underline"
								>
									{t("openModule")}
								</Link>
							</div>
						</div>
						{r.status !== "not_applicable" && (
							<ul className="mt-3 flex flex-col gap-1.5 border-t pt-3 text-sm">
								{r.checks.map((c) => {
									const href = checkHref(c.check);
									const manual = c.check.kind === "manual";
									return (
										<li
											key={`${r.item.code}-${checkLabel(c.check)}`}
											className="flex items-start justify-between gap-3"
										>
											{manual ? (
												<ApplicationCheck
													code={r.item.code}
													done={c.status === "done"}
													label={checkLabel(c.check)}
													disabled={!canEdit}
												/>
											) : href ? (
												<Link
													href={href}
													className="hover:underline underline-offset-4"
												>
													{checkLabel(c.check)}
												</Link>
											) : (
												<span>{checkLabel(c.check)}</span>
											)}
											<span className="flex items-center gap-2">
												{manual && state[r.item.code]?.at && (
													<span className="text-muted-foreground text-xs">
														{fmtDate.format(
															new Date(state[r.item.code]?.at ?? ""),
														)}
													</span>
												)}
												<Badge variant={TONE[c.status]}>
													{t(`status_${c.status}`)}
												</Badge>
											</span>
										</li>
									);
								})}
							</ul>
						)}
						{r.status === "not_applicable" && (
							<p className="mt-2 text-muted-foreground text-xs">
								{t("notApplicableHint", {
									services: (r.item.services ?? []).join(", "),
								})}
							</p>
						)}
					</li>
				))}
			</ol>
			<p className="mt-6 text-muted-foreground text-xs">
				{t("disclaimer")}{" "}
				{CONTROL_BY_CODE.has("CC-REG-03") && (
					<Link
						href="/controls/CC-REG-03"
						className="text-primary hover:underline"
					>
						CC-REG-03
					</Link>
				)}
			</p>
		</>
	);
}
