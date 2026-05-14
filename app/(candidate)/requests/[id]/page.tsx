import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { listActiveDisclosures } from "@/app/actions/disclosures";
import { getIncomingInterest } from "@/app/actions/interests";
import {
	listMyDisclosuresForInterest,
	listMyReferences,
} from "@/app/actions/references";
import { listVaultItems } from "@/app/actions/vault";
import { auth } from "@/auth";
import { FileDisclosureList } from "@/components/disclosures/file-disclosure-list";
import { ReferenceDisclosureList } from "@/components/disclosures/reference-disclosure-list";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { DecisionButtons } from "@/components/interests/decision-buttons";
import { cn } from "@/lib/utils";
import { listVerificationsForInterest } from "@/lib/verify/orchestrator";

const KIND_LABELS: Record<string, string> = {
	identity: "Identität",
	cert: "Zertifikat",
	badge: "Open Badge",
	employment: "Arbeitsverhältnis",
};

const STATUS_COLORS: Record<string, string> = {
	pending: "border-amber-500/40 text-amber-700 dark:text-amber-300",
	passed: "border-emerald-500/40 text-emerald-700 dark:text-emerald-300",
	failed: "border-rose-500/40 text-rose-700 dark:text-rose-300",
};

export default async function RequestDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const session = await auth();
	if (!session?.user) redirect("/login");

	const { id } = await params;
	const item = await getIncomingInterest(id);
	if (!item) notFound();

	const t = await getTranslations("Requests");
	const fmt = await getFormatter();
	const { interest, job, companyName } = item;
	const verifications = await listVerificationsForInterest(id);
	const vaultItemsAll = await listVaultItems();
	const activeDisclosures = await listActiveDisclosures(id);
	const grantedIds = new Set(activeDisclosures.map((d) => d.vaultItemId));
	const myReferences = await listMyReferences();
	const grantedRefIds = await listMyDisclosuresForInterest(id);

	return (
		<>
			<Header />
			<main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-12 pb-24 sm:px-6 sm:pt-16">
				<header className="mb-8">
					<Link
						href="/requests"
						className="text-muted-foreground text-xs hover:text-foreground"
					>
						← {t("title")}
					</Link>
					<h1 className="mt-1 font-semibold text-2xl tracking-tight sm:text-3xl">
						{job.title}
					</h1>
					<p className="mt-1 text-muted-foreground text-sm">{companyName}</p>
				</header>

				<section className="space-y-4">
					<div className="rounded-lg border border-border bg-background p-4 sm:p-5">
						<h2 className="font-medium text-sm">{t("whatTheyAsked")}</h2>
						<p className="mt-2 text-muted-foreground text-xs leading-relaxed">
							{t(`depthExplain.${interest.verifyDepth}`)}
						</p>
					</div>

					{verifications.length > 0 && (
						<div className="rounded-lg border border-border bg-background p-4 sm:p-5">
							<h2 className="font-medium text-sm">{t("verificationsTitle")}</h2>
							<p className="mt-1 mb-3 text-muted-foreground text-xs leading-relaxed">
								{t("verificationsHint")}
							</p>
							<ul className="space-y-2">
								{verifications.map((v) => (
									<li
										key={v.id}
										className="flex items-start justify-between gap-3 rounded-md border border-border bg-muted/20 p-3"
									>
										<div className="min-w-0 flex-1">
											<div className="font-medium text-sm">
												{KIND_LABELS[v.kind] ?? v.kind}{" "}
												<span className="font-mono text-muted-foreground text-xs">
													· {v.connector}
												</span>
											</div>
											{v.message && (
												<div className="mt-0.5 text-muted-foreground text-xs">
													{v.message}
												</div>
											)}
										</div>
										<span
											className={cn(
												"shrink-0 rounded-md border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider",
												STATUS_COLORS[v.status],
											)}
										>
											{v.status}
										</span>
									</li>
								))}
							</ul>
						</div>
					)}

					{interest.message && (
						<div className="rounded-lg border border-border bg-background p-4 sm:p-5">
							<h2 className="font-medium text-sm">
								{t("messageFrom", { company: companyName })}
							</h2>
							<div className="mt-2">
								<p className="whitespace-pre-wrap text-foreground/90 text-sm leading-relaxed">
									{interest.message}
								</p>
							</div>
						</div>
					)}

					<div className="rounded-lg border border-border bg-background p-4 sm:p-5">
						<h2 className="font-medium text-sm">{t("aboutTheJob")}</h2>
						<div className="mt-2">
							<p className="line-clamp-6 whitespace-pre-wrap text-foreground/90 text-sm leading-relaxed">
								{job.description}
							</p>
						</div>
					</div>

					{(job.salaryMin || job.salaryMax || job.salaryBenchmarkLow) && (
						<div
							className={cn(
								"rounded-lg border p-4 sm:p-5",
								job.salaryFairness === "under"
									? "border-rose-500/30 bg-rose-500/5"
									: job.salaryFairness === "over"
										? "border-amber-500/30 bg-amber-500/5"
										: "border-border bg-background",
							)}
						>
							<h2 className="font-medium text-sm">{t("salaryHeading")}</h2>
							{(job.salaryMin || job.salaryMax) && (
								<p className="mt-2 font-mono text-sm">
									{job.salaryMin
										? fmt.number(job.salaryMin, {
												style: "currency",
												currency: "EUR",
												maximumFractionDigits: 0,
											})
										: ""}
									{job.salaryMax && job.salaryMin ? " – " : ""}
									{job.salaryMax
										? fmt.number(job.salaryMax, {
												style: "currency",
												currency: "EUR",
												maximumFractionDigits: 0,
											})
										: ""}{" "}
									<span className="text-muted-foreground text-xs">
										{t("salaryGross")}
									</span>
								</p>
							)}
							{job.salaryBenchmarkLow != null &&
								job.salaryBenchmarkHigh != null && (
									<p className="mt-2 text-muted-foreground text-xs leading-snug">
										{t("salaryBenchmark", {
											low: fmt.number(job.salaryBenchmarkLow, {
												style: "currency",
												currency: "EUR",
												maximumFractionDigits: 0,
											}),
											high: fmt.number(job.salaryBenchmarkHigh, {
												style: "currency",
												currency: "EUR",
												maximumFractionDigits: 0,
											}),
										})}
										{job.salaryFairness === "under" &&
											job.salaryDeltaPct != null &&
											` · ${t("salaryUnder", { pct: Math.abs(job.salaryDeltaPct) })}`}
										{job.salaryFairness === "over" &&
											job.salaryDeltaPct != null &&
											` · ${t("salaryOver", { pct: job.salaryDeltaPct })}`}
										{job.salaryFairness === "fair" && ` · ${t("salaryFair")}`}
									</p>
								)}
						</div>
					)}

					<div className="rounded-lg border border-border bg-background p-4 text-muted-foreground text-xs sm:p-5">
						{t("receivedAt", {
							time: fmt.dateTime(interest.createdAt, {
								dateStyle: "long",
								timeStyle: "short",
							}),
						})}
						{interest.expiresAt && (
							<>
								{" · "}
								{t("expiresAt", {
									time: fmt.dateTime(interest.expiresAt, {
										dateStyle: "long",
									}),
								})}
							</>
						)}
					</div>

					{interest.status === "approved" && (
						<>
							<div className="rounded-lg border border-border bg-background p-4 sm:p-5">
								<h2 className="font-medium text-sm">
									{t("disclosures.title")}
								</h2>
								<p className="mt-1 mb-3 text-muted-foreground text-xs leading-relaxed">
									{t("disclosures.subtitle")}
								</p>
								<FileDisclosureList
									interestId={interest.id}
									items={vaultItemsAll
										.filter((v) => v.storageKey || v.sourceUrl)
										.map((v) => ({
											id: v.id,
											filename: v.filename,
											kind: v.kind,
										}))}
									grantedIds={grantedIds}
								/>
							</div>

							{myReferences.length > 0 && (
								<div className="rounded-lg border border-border bg-background p-4 sm:p-5">
									<h2 className="font-medium text-sm">
										{t("referenceDisclosure.title")}
									</h2>
									<p className="mt-1 mb-3 text-muted-foreground text-xs leading-relaxed">
										{t("referenceDisclosure.subtitle")}
									</p>
									<ReferenceDisclosureList
										interestId={interest.id}
										references={myReferences}
										initiallyGranted={grantedRefIds}
									/>
								</div>
							)}
						</>
					)}

					{interest.status === "pending" ? (
						<DecisionButtons interestId={interest.id} />
					) : (
						<div className="rounded-lg border border-border bg-muted/30 p-4 text-sm sm:p-5">
							<div className="font-medium">
								{t(`status.${interest.status}`)}
							</div>
							{interest.decidedAt && (
								<div className="mt-1 text-muted-foreground text-xs">
									{t("decidedAt", {
										time: fmt.dateTime(interest.decidedAt, {
											dateStyle: "medium",
											timeStyle: "short",
										}),
									})}
								</div>
							)}
						</div>
					)}
				</section>
			</main>
			<Footer />
		</>
	);
}
