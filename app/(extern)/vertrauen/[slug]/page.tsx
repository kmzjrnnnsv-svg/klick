import { Download, Lock } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { cache } from "react";
import { TrustRequestForm } from "@/components/trust-center/request-form";
import { Badge } from "@/components/ui/badge";
import { DOMAINS, type Domain } from "@/db/schema/enums";
import { fmtDate } from "@/lib/compliance/page-data";
import { publicTrustCenter } from "@/lib/db/trust";
import { isServiceType, trustDocumentHref } from "@/lib/trust/labels";

// /vertrauen/<slug> — öffentliches Trust Center einer Org. Gezeigt wird nur
// der veröffentlichte Snapshot (Policy trust_centers_public); vertrauliche
// Unterlagen gibt es nach Anfrage, NDA und Freigabe.

const load = cache((slug: string) => publicTrustCenter(slug));

export async function generateMetadata({
	params,
}: {
	params: Promise<{ slug: string }>;
}): Promise<Metadata> {
	const center = await load((await params).slug);
	if (!center) return { title: "Trust Center", robots: { index: false } };
	const s = center.snapshot;
	return {
		title: `${s.title} · Trust Center`,
		description: s.intro.slice(0, 160),
		robots: { index: s.indexable, follow: s.indexable },
	};
}

export default async function PublicTrustCenterPage({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const { slug } = await params;
	const center = await load(slug);
	if (!center) notFound();
	const s = center.snapshot;
	const t = await getTranslations("TrustCenter");
	const tc = await getTranslations("Controls");
	const tp = await getTranslations("Providers");
	const ndaDocs = s.documents.filter((d) => d.access === "nda");
	const domainKnown = (d: string): d is Domain =>
		(DOMAINS as readonly string[]).includes(d);

	return (
		<div className="flex flex-col gap-10">
			<header className="flex flex-col gap-3">
				<h1 className="text-balance font-bold text-title-1 leading-tight sm:text-4xl">
					{s.title}
				</h1>
				<p className="text-muted-foreground text-subhead">
					{t("publicEyebrow", { org: s.orgName })}
				</p>
				{s.intro && (
					<p className="max-w-2xl whitespace-pre-line break-words text-muted-foreground leading-relaxed">
						{s.intro}
					</p>
				)}
				<p className="text-muted-foreground text-subhead">
					{center.publishedAt &&
						t("publicAsOf", { date: fmtDate.format(center.publishedAt) })}
					{s.contactEmail && (
						<>
							{" · "}
							<a
								className="underline underline-offset-4"
								href={`mailto:${s.contactEmail}`}
							>
								{s.contactEmail}
							</a>
						</>
					)}
				</p>
			</header>

			{s.frameworks.length > 0 && (
				<section
					aria-labelledby="tc-frameworks"
					className="flex flex-col gap-4"
				>
					<h2 id="tc-frameworks" className="font-bold text-title-2">
						{t("publicFrameworks")}
					</h2>
					<ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
						{s.frameworks.map((f) => (
							<li
								key={f.slug}
								className="flex flex-col gap-2 rounded-2xl bg-card p-4"
							>
								<div className="flex flex-wrap items-start justify-between gap-2">
									<p className="font-medium">{f.name}</p>
									<Badge
										variant={f.status === "certified" ? "default" : "outline"}
									>
										{t(`status_${f.status}`)}
									</Badge>
								</div>
								{f.validUntil && (
									<p className="text-muted-foreground text-subhead">
										{t("validUntil", {
											date: fmtDate.format(new Date(f.validUntil)),
										})}
									</p>
								)}
								{f.note && <p className="text-subhead">{f.note}</p>}
								{f.coverage !== null && (
									<div className="flex items-center gap-2 text-muted-foreground text-footnote">
										<span
											className="h-1.5 grow overflow-hidden rounded-full bg-muted"
											aria-hidden="true"
										>
											<span
												className="block h-full bg-primary"
												style={{ width: `${f.coverage}%` }}
											/>
										</span>
										<span className="tabular-nums">
											{t("coverage", { pct: f.coverage })}
										</span>
									</div>
								)}
							</li>
						))}
					</ul>
				</section>
			)}

			{s.domains && s.domains.length > 0 && (
				<section aria-labelledby="tc-controls" className="flex flex-col gap-4">
					<h2 id="tc-controls" className="font-bold text-title-2">
						{t("publicControls")}
					</h2>
					<p className="text-muted-foreground text-subhead">
						{t("publicControlsLead")}
					</p>
					<ul className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
						{s.domains.map((d) => (
							<li
								key={d.domain}
								className="flex items-baseline justify-between gap-3 border-b py-1.5 text-subhead"
							>
								<span>
									{domainKnown(d.domain) ? tc(`domain_${d.domain}`) : d.domain}
								</span>
								<span className="whitespace-nowrap text-muted-foreground tabular-nums">
									{t("domainCount", { done: d.implemented, total: d.total })}
								</span>
							</li>
						))}
					</ul>
				</section>
			)}

			{s.subprocessors && (
				<section
					aria-labelledby="tc-subprocessors"
					className="flex flex-col gap-4"
				>
					<h2 id="tc-subprocessors" className="font-bold text-title-2">
						{t("publicSubprocessors")}
					</h2>
					{s.subprocessors.length === 0 ? (
						<p className="text-muted-foreground text-subhead">
							{t("publicSubprocessorsNone")}
						</p>
					) : (
						<div className="overflow-x-auto rounded-2xl bg-card">
							<table className="w-full text-subhead">
								<thead>
									<tr className="text-left">
										<th className="px-3 py-2 font-medium">{t("colName")}</th>
										<th className="px-3 py-2 font-medium">{t("colService")}</th>
										<th className="px-3 py-2 font-medium">
											{t("colLocations")}
										</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-border/60">
									{s.subprocessors.map((p) => (
										<tr key={p.name}>
											<td className="px-3 py-2">{p.name}</td>
											<td className="px-3 py-2 text-muted-foreground">
												{isServiceType(p.category)
													? tp(`service_${p.category}`)
													: "—"}
											</td>
											<td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
												{p.locations.join(", ") || "—"}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</section>
			)}

			{s.documents.length > 0 && (
				<section aria-labelledby="tc-documents" className="flex flex-col gap-4">
					<h2 id="tc-documents" className="font-bold text-title-2">
						{t("publicDocuments")}
					</h2>
					<ul className="flex flex-col list-inset overflow-hidden rounded-2xl bg-card">
						{s.documents.map((d) => (
							<li
								key={d.versionId}
								className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
							>
								<div className="min-w-0">
									<p className="font-medium">{d.title}</p>
									<p className="text-muted-foreground text-footnote">
										<span
											className="whitespace-nowrap font-mono"
											translate="no"
										>
											{d.docNumber}
										</span>{" "}
										· {t("version", { version: d.version })}
									</p>
								</div>
								{d.access === "public" ? (
									<a
										href={trustDocumentHref(center.slug, d.versionId)}
										className="inline-flex items-center gap-1.5 text-subhead underline underline-offset-4"
									>
										<Download className="size-4" aria-hidden="true" />
										{t("download")}
									</a>
								) : (
									<a
										href="#zugang"
										className="inline-flex items-center gap-1.5 text-muted-foreground text-subhead"
									>
										<Lock className="size-4" aria-hidden="true" />
										{t("ndaOnly")}
									</a>
								)}
							</li>
						))}
					</ul>
				</section>
			)}

			{ndaDocs.length > 0 && (
				<section
					id="zugang"
					aria-labelledby="tc-request"
					className="flex scroll-mt-20 flex-col gap-4"
				>
					<h2 id="tc-request" className="font-bold text-title-2">
						{t("requestTitle")}
					</h2>
					<p className="max-w-2xl text-muted-foreground text-subhead">
						{t("requestLead", { org: s.orgName })}
					</p>
					<TrustRequestForm
						slug={center.slug}
						ndaText={s.ndaText}
						ndaVersion={s.ndaVersion}
						orgName={s.orgName}
					/>
				</section>
			)}

			<p className="border-t pt-6 text-muted-foreground text-footnote">
				{t("publicFooter", { org: s.orgName })}{" "}
				<a
					href={`/leistungen?meldung=${encodeURIComponent(`/vertrauen/${center.slug}`)}#anfrage`}
					className="underline underline-offset-4 hover:text-foreground"
				>
					{t("reportContent")}
				</a>
			</p>
		</div>
	);
}
