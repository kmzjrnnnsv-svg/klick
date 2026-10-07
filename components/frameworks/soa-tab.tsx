import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	CONTROL_BY_CODE,
	EDGES_BY_REQUIREMENT,
} from "@/lib/compliance/catalog";
import { DOCUMENT_TEMPLATES } from "@/lib/compliance/catalog/document-templates";
import type { CatalogRequirement } from "@/lib/compliance/catalog/types";
import type { ReqCoverage } from "@/lib/compliance/coverage";
import type { OrgCoverage } from "@/lib/compliance/queries";

// Statement of Applicability (ISO 27001 Klausel 6.1.3 d) — vollständig
// abgeleitet: Anwendbarkeit + Begründung aus requirement_applicability
// (bzw. Profil), umsetzende Controls mit Status, Nachweise je Control.
// Dazu der Check „ISO-Pflichtdokumente vollständig?" gegen die Vorlagen
// mit isoMandatory-Flag.

const TONE: Record<ReqCoverage, "success" | "warning" | "outline" | "muted"> = {
	covered: "success",
	partial: "warning",
	open: "outline",
	not_applicable: "muted",
};

// Status-Label-Keys im Namespace "Status" (siehe lib/entities/{control,document}.ts)
const IMPL_KEY = {
	not_started: "notStarted",
	planned: "planned",
	in_progress: "inProgress",
	implemented: "implemented",
	not_applicable: "notApplicable",
} as const;
const DOC_KEY = {
	draft: "docDraft",
	in_review: "docInReview",
	approved: "docApproved",
	published: "docPublished",
	retired: "docRetired",
	superseded: "docSuperseded",
} as const;

const IMPL_TONE: Record<string, "success" | "warning" | "outline" | "muted"> = {
	implemented: "success",
	in_progress: "warning",
	planned: "outline",
	not_started: "outline",
	not_applicable: "muted",
};

export type SoaDocument = {
	docNumber: string;
	title: string;
	status: string;
	templateCode: string | null;
	isoMandatory: boolean;
};

export async function SoaTab({
	slug,
	requirements,
	cov,
	evidenceByControl,
	documents,
}: {
	slug: string;
	requirements: readonly CatalogRequirement[];
	cov: OrgCoverage;
	evidenceByControl: ReadonlyMap<string, number>;
	documents: readonly SoaDocument[];
}) {
	const t = await getTranslations("Frameworks");
	const ts = await getTranslations("Status");

	const rows = requirements.map((r) => {
		const key = `${slug}:${r.code}`;
		const status = cov.result.byRequirement.get(key) ?? ("open" as ReqCoverage);
		const detail = cov.applicabilityDetail.get(key);
		const applicable = status !== "not_applicable";
		const edges = EDGES_BY_REQUIREMENT.get(key) ?? [];
		const justification =
			detail?.note ??
			(applicable
				? t("soaJustificationDefault")
				: t(
						`source_${detail?.source ?? "default"}` as
							| "source_rule"
							| "source_services"
							| "source_stage"
							| "source_lex_specialis"
							| "source_manual"
							| "source_default",
					));
		return { r, key, status, applicable, justification, edges };
	});
	const counts = {
		applicable: rows.filter((x) => x.applicable).length,
		na: rows.filter((x) => !x.applicable).length,
		covered: rows.filter((x) => x.status === "covered").length,
		partial: rows.filter((x) => x.status === "partial").length,
		open: rows.filter((x) => x.status === "open").length,
	};

	// Pflichtdokumente: Vorlage ↔ vorhandenes Dokument (templateCode oder Flag)
	const mandatory = DOCUMENT_TEMPLATES.filter((tpl) => tpl.isoMandatory);
	const docRows = mandatory.map((tpl) => {
		const present = documents.find(
			(d) =>
				d.templateCode === tpl.code ||
				(d.isoMandatory &&
					d.title.toLowerCase().trim() === tpl.title.toLowerCase().trim()),
		);
		return { tpl, present: present ?? null };
	});
	const presentCount = docRows.filter((d) => d.present).length;

	return (
		<div className="flex flex-col gap-8">
			<p className="text-muted-foreground text-sm">{t("soaLead")}</p>
			<p className="text-sm">{t("soaCounts", counts)}</p>

			<section className="flex flex-col gap-3">
				<div className="flex flex-wrap items-baseline justify-between gap-3">
					<h2 className="lv-eyebrow text-[0.6rem] text-muted-foreground">
						{t("isoMandatoryDocs")}
					</h2>
					<span className="text-muted-foreground text-xs">
						{t("isoMandatoryComplete", {
							present: presentCount,
							total: docRows.length,
						})}
					</span>
				</div>
				<p className="text-muted-foreground text-xs">{t("isoMandatoryLead")}</p>
				<ul className="grid gap-1.5 text-sm sm:grid-cols-2">
					{docRows.map(({ tpl, present }) => (
						<li
							key={tpl.code}
							className="flex items-center justify-between gap-3 rounded-md border px-3 py-1.5"
						>
							<span className="min-w-0 truncate">
								{present ? (
									<Link
										href={`/dokumente/${encodeURIComponent(present.docNumber)}`}
										className="hover:underline underline-offset-4"
									>
										<span className="mr-2 font-mono text-xs text-muted-foreground">
											{present.docNumber}
										</span>
										{tpl.title}
									</Link>
								) : (
									<span>{tpl.title}</span>
								)}
							</span>
							{present ? (
								<Badge variant="success">
									{t("docPresent")} ·{" "}
									{ts(
										DOC_KEY[present.status as keyof typeof DOC_KEY] ??
											"docDraft",
									)}
								</Badge>
							) : (
								<Link href="/dokumente?vorlagen=1">
									<Badge variant="destructive">{t("docMissing")}</Badge>
								</Link>
							)}
						</li>
					))}
				</ul>
				{presentCount < docRows.length && (
					<Link
						href="/dokumente?vorlagen=1"
						className="text-primary text-sm underline-offset-4 hover:underline"
					>
						{t("docOpenTemplates")} →
					</Link>
				)}
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="lv-eyebrow text-[0.6rem] text-muted-foreground">
					Annex A
				</h2>
				<div className="overflow-x-auto rounded-md border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-24">{t("requirement")}</TableHead>
								<TableHead>{t("applicability")}</TableHead>
								<TableHead className="max-w-[18rem]">
									{t("soaJustification")}
								</TableHead>
								<TableHead>{t("soaControls")}</TableHead>
								<TableHead className="w-28">{t("status")}</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map(({ r, status, applicable, justification, edges }) => (
								<TableRow key={r.code}>
									<TableCell className="align-top">
										<Link
											href={`/rahmenwerke/${slug}/${encodeURIComponent(r.code)}`}
											className="font-mono text-xs hover:underline underline-offset-4"
										>
											{r.code}
										</Link>
										<p className="mt-0.5 text-muted-foreground text-xs leading-snug">
											{r.title}
										</p>
									</TableCell>
									<TableCell className="align-top">
										<Badge variant={applicable ? "outline" : "muted"}>
											{applicable ? t("soaApplicable") : t("soaNotApplicable")}
										</Badge>
									</TableCell>
									<TableCell className="max-w-[18rem] align-top text-xs leading-snug">
										{justification}
									</TableCell>
									<TableCell className="align-top">
										{edges.length === 0 ? (
											<span className="text-muted-foreground text-xs">
												{t("soaNoControls")}
											</span>
										) : (
											<div className="flex flex-col gap-1">
												{edges.map((e) => {
													const c = CONTROL_BY_CODE.get(e.control);
													const s =
														cov.implStatus.get(e.control) ?? "not_started";
													const ev = evidenceByControl.get(e.control) ?? 0;
													return (
														<div
															key={e.control}
															className="flex flex-wrap items-center gap-1.5 text-xs"
														>
															<Link
																href={`/controls/${e.control}`}
																className="font-mono hover:underline underline-offset-4"
																title={c?.title}
															>
																{e.control}
															</Link>
															<Badge variant={IMPL_TONE[s] ?? "outline"}>
																{ts(
																	IMPL_KEY[s as keyof typeof IMPL_KEY] ??
																		"notStarted",
																)}
																{e.coverage === "partial" ? " · teilw." : ""}
															</Badge>
															<span
																className={
																	ev === 0
																		? "text-destructive"
																		: "text-muted-foreground"
																}
															>
																{ev === 0
																	? t("soaNoEvidence")
																	: `${ev} ${t("soaEvidence")}`}
															</span>
														</div>
													);
												})}
											</div>
										)}
									</TableCell>
									<TableCell className="align-top">
										<Badge variant={TONE[status]}>
											{t(
												status === "covered"
													? "covered"
													: status === "partial"
														? "partial"
														: status === "not_applicable"
															? "notApplicableShort"
															: "open",
											)}
										</Badge>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			</section>
		</div>
	);
}
