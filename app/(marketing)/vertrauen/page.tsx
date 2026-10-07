import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SectionDivider } from "@/components/marketing/landing-decor";
import { buttonVariants } from "@/components/ui/button";
import { ART30_CLAUSES } from "@/lib/compliance/catalog/art30-clauses";
import { BASELINE } from "@/lib/compliance/catalog/baseline";
import { PLATFORM_SUPPLIER } from "@/lib/compliance/catalog/platform-supplier";
import { cn } from "@/lib/utils";

// /vertrauen — öffentlich: was die Plattform selbst umgesetzt hat (Mandant 0)
// und das Lieferantenpaket für Finanzkunden nach DORA Art. 28–30.
export default async function TrustPage() {
	const t = await getTranslations("Trust");
	const p = PLATFORM_SUPPLIER;
	const counts = BASELINE.controls.reduce(
		(acc, c) => {
			acc[c.status] = (acc[c.status] ?? 0) + 1;
			return acc;
		},
		{} as Record<string, number>,
	);
	return (
		<main className="flex-1">
			<section className="mx-auto max-w-5xl px-4 pt-16 pb-6 sm:px-6 sm:pt-24">
				<p className="lv-eyebrow text-[0.62rem] text-brown">{t("eyebrow")}</p>
				<h1 className="mt-5 max-w-3xl font-serif-display text-4xl text-primary leading-[1.05] sm:text-5xl">
					{t("title")}
				</h1>
				<p className="mt-6 max-w-2xl text-lg text-muted-foreground leading-relaxed">
					{t("lead")}
				</p>
				<p className="mt-4 text-muted-foreground text-sm">
					{t("asOf", {
						date: p.asOf,
						implemented: counts.implemented ?? 0,
						inProgress: counts.in_progress ?? 0,
						planned: counts.planned ?? 0,
					})}
				</p>
				<div className="mt-8 flex flex-wrap gap-3">
					<a
						href="/vertrauen/paket.md"
						className={cn(buttonVariants({ variant: "brown", size: "lg" }))}
					>
						{t("download")}
					</a>
					<Link
						href="/login"
						className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
					>
						{t("baselineLink")}
					</Link>
				</div>
			</section>

			<SectionDivider />

			<section className="mx-auto max-w-5xl px-4 sm:px-6">
				<h2 className="font-serif-display text-2xl text-primary sm:text-3xl">
					{t("measuresTitle")}
				</h2>
				<p className="mt-3 max-w-2xl text-muted-foreground">
					{t("measuresLead")}
				</p>
				<div className="mt-10 grid gap-8 sm:grid-cols-2">
					{BASELINE.narrative.map((n) => (
						<article key={n.domain} className="flex flex-col gap-3">
							<h3 className="font-serif-display text-xl leading-tight">
								{n.title}
							</h3>
							<ul className="flex flex-col gap-1.5 text-muted-foreground text-sm leading-relaxed">
								{n.present.map((item) => (
									<li key={item} className="flex gap-2">
										<span
											aria-hidden="true"
											className="mt-[0.45rem] h-1 w-1 shrink-0 rounded-full bg-brown"
										/>
										<span>{item}</span>
									</li>
								))}
							</ul>
						</article>
					))}
				</div>
			</section>

			<SectionDivider />

			<section className="mx-auto max-w-5xl px-4 sm:px-6">
				<p className="lv-eyebrow text-[0.62rem] text-brown">
					{t("supplierEyebrow")}
				</p>
				<h2 className="mt-3 font-serif-display text-2xl text-primary sm:text-3xl">
					{t("supplierTitle")}
				</h2>
				<p className="mt-3 max-w-2xl text-muted-foreground">
					{t("supplierLead")}
				</p>

				<h3 className="mt-10 font-serif-display text-xl">
					{t("registerTitle")}
				</h3>
				<p className="mt-2 text-muted-foreground text-sm">{p.role}</p>
				<div className="mt-4 overflow-x-auto rounded-md border">
					<table className="w-full text-sm">
						<tbody className="divide-y divide-border/60">
							{p.registerSheet.map((r) => (
								<tr key={r.field}>
									<th
										scope="row"
										className="w-1/2 px-3 py-2 text-left font-mono text-muted-foreground text-xs"
									>
										{r.field}
									</th>
									<td className="px-3 py-2">{r.value}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>

				<h3 className="mt-10 font-serif-display text-xl">{t("art30Title")}</h3>
				<p className="mt-2 text-muted-foreground text-sm">{t("art30Lead")}</p>
				<div className="mt-4 overflow-x-auto rounded-md border">
					<table className="w-full text-sm">
						<thead>
							<tr className="text-left">
								<th className="px-3 py-2 font-medium">{t("colClause")}</th>
								<th className="px-3 py-2 font-medium">{t("colContent")}</th>
								<th className="px-3 py-2 font-medium">{t("colCommitment")}</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-border/60">
							{ART30_CLAUSES.map((c) => (
								<tr key={c.code} className="align-top">
									<td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
										{c.code}
										{c.criticalOnly && (
											<span className="ml-1 text-muted-foreground">
												{t("criticalOnly")}
											</span>
										)}
									</td>
									<td className="px-3 py-2">
										<p className="font-medium">{c.title}</p>
										<p className="text-muted-foreground text-xs">{c.text}</p>
									</td>
									<td className="px-3 py-2 text-muted-foreground">
										{p.commitments[c.code]}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>

				<div className="mt-10 grid gap-10 sm:grid-cols-2">
					<div>
						<h3 className="font-serif-display text-xl">
							{t("subcontractorsTitle")}
						</h3>
						<ul className="mt-3 flex flex-col gap-3 text-sm">
							{p.subcontractors.map((s) => (
								<li key={s.name}>
									<p className="font-medium">
										{s.name}{" "}
										<span className="text-muted-foreground">· {s.country}</span>
									</p>
									<p className="text-muted-foreground text-xs">
										{s.service} — {s.purpose}
										{s.personalData ? ` · ${t("personalData")}` : ""}
									</p>
								</li>
							))}
						</ul>
					</div>
					<div className="flex flex-col gap-8">
						<div>
							<h3 className="font-serif-display text-xl">
								{t("incidentTitle")}
							</h3>
							<p className="mt-3 text-muted-foreground text-sm leading-relaxed">
								{p.incident.text}
							</p>
						</div>
						<div>
							<h3 className="font-serif-display text-xl">{t("exitTitle")}</h3>
							<ul className="mt-3 flex flex-col gap-1.5 text-muted-foreground text-sm leading-relaxed">
								{p.exit.map((e) => (
									<li key={e} className="flex gap-2">
										<span
											aria-hidden="true"
											className="mt-[0.45rem] h-1 w-1 shrink-0 rounded-full bg-brown"
										/>
										<span>{e}</span>
									</li>
								))}
							</ul>
						</div>
						<div>
							<h3 className="font-serif-display text-xl">{t("dpaTitle")}</h3>
							<p className="mt-3 text-muted-foreground text-sm leading-relaxed">
								{p.dpa}
							</p>
						</div>
					</div>
				</div>
				<p className="mt-16 mb-24 text-muted-foreground text-xs">
					{t("footnote")}
				</p>
			</section>
		</main>
	);
}
