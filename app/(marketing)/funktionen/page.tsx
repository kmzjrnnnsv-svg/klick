import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { withMessages } from "@/components/i18n/with-messages";
import { AtlasIndex } from "@/components/marketing/atlas-index";
import { AudienceGuide } from "@/components/marketing/audience-guide";
import { FrameworkPicker } from "@/components/marketing/framework-picker";
import { RevealRoot } from "@/components/marketing/reveal";
import { assetUrl } from "@/lib/marketing/asset-url";
import { AUDIENCE_DEFAULT, audienceViews } from "@/lib/marketing/audiences";
import {
	catalogTotals,
	evidenceByIsoClause,
	pickerFrameworks,
} from "@/lib/marketing/catalog-facts";
import {
	PICKER_DEFAULT,
	WORKFLOW_COUNT,
	WORKFLOW_GROUPS,
	type Workflow,
} from "@/lib/marketing/workflows";
import { cn } from "@/lib/utils";
import s from "./funktionen.module.css";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Features");
	return { title: t("metaTitle"), description: t("metaDescription") };
}

// /funktionen — öffentlich, vor der Anmeldung: jeder Ablauf in Klick mit
// Auslöser, Schritten und Ergebnis, dazu echte Ausschnitte der Oberfläche
// (Richtung „The product performs“, taste-skill). Zahlen aus dem Katalog.
// Je Bereich die ersten drei Abläufe, der Rest hinter „Alle ansehen“
const VISIBLE = 3;

async function FeaturesPage() {
	const t = await getTranslations("Features");
	const frameworks = pickerFrameworks();
	const totals = catalogTotals();
	const fwBy = new Map(frameworks.map((f) => [f.slug, f]));
	const clauses = evidenceByIsoClause();
	// Beispiel für den Hinweis unter dem Ausschnitt, aus dem Katalog
	const micar = fwBy.get("micar");
	const example = micar?.example;

	return (
		<RevealRoot as="main" id="inhalt" className={s.page}>
			{/* Hero: Überschrift und der Rahmenwerk-Ausschnitt auf der Bühne */}
			<section className={s.hero} aria-labelledby="fn-title">
				<div className={s.heroText}>
					<h1 id="fn-title" className={s.heroTitle}>
						{t("heroTitle1")}
						<br />
						{t("heroTitle2")}
					</h1>
					<p className={s.heroLead}>{t("heroLead")}</p>
					<a href="#ablaeufe" className={s.button}>
						{t("heroAction")}
					</a>
				</div>
				<div className={s.stage}>
					<div className={s.stageInner}>
						<FrameworkPicker frameworks={frameworks} initial={PICKER_DEFAULT} />
					</div>
				</div>
				<ul className={s.stageNotes}>
					<li>{t("pickerNoteAdded")}</li>
					<li>
						{micar && example
							? t("pickerNoteTerms", {
									name: `${micar.label} ${example.code}`,
									n: example.controls,
								})
							: t("pickerNoteTermsPlain")}
					</li>
				</ul>
			</section>

			{/* Rundgang: kurzes Video (Beispieldaten), startet nur auf Klick */}
			<section className={s.tour} aria-labelledby="fn-tour">
				<div className={s.tourHead}>
					<h2 id="fn-tour" className={s.h2} data-r="">
						{t("tourTitle")}
					</h2>
					<p className={s.atlasLead} data-r="">
						{t("tourLead")}
					</p>
				</div>
				<video
					className={s.tourVideo}
					controls
					muted
					playsInline
					preload="none"
					poster={assetUrl("/funktionen/rundgang.jpg")}
					width={1280}
					height={720}
					aria-describedby="fn-tour-text"
				>
					<source src={assetUrl("/funktionen/rundgang.mp4")} type="video/mp4" />
					<source
						src={assetUrl("/funktionen/rundgang.webm")}
						type="video/webm"
					/>
				</video>
				<p id="fn-tour-text" className={s.tourText}>
					{t("tourText")}
				</p>
			</section>

			{/* Nachweise je Normpunkt: ISO 27001 Kapitel 4–10 als Leiste */}
			<section className={s.clauses} aria-labelledby="fn-clauses">
				<div className={s.clausesHead}>
					<h2 id="fn-clauses" className={s.h2} data-r="">
						{t("clausesTitle")}
					</h2>
					<p className={s.atlasLead} data-r="">
						{t("clausesLead")}
					</p>
				</div>
				<ol className={s.clauseRail}>
					{clauses.map((c) => (
						<li key={c.clause} className={s.clause} data-r="">
							<p className={s.clauseNo} aria-hidden="true">
								{c.clause}
							</p>
							<p className={s.clauseTitle}>
								<span className="sr-only">
									{t("clausesNo", { n: c.clause })}{" "}
								</span>
								{c.title}
							</p>
							<ul className={s.clauseKinds}>
								{c.kinds.map((k) => (
									<li key={k}>{k}</li>
								))}
							</ul>
							{c.alsoFor.length > 0 && (
								<p className={s.clauseAlso}>
									{t("clausesAlso", { list: c.alsoFor.join(", ") })}
								</p>
							)}
						</li>
					))}
				</ol>
			</section>

			{/* Alle Abläufe: Bereiche als Index, je Bereich eine gruppierte
			    Liste zum Aufklappen und ein Bild (Apple HIG) */}
			<section id="ablaeufe" className={s.atlas} aria-labelledby="fn-list">
				<AtlasIndex
					label={t("indexLabel")}
					groups={WORKFLOW_GROUPS.map((g) => ({
						key: g.key,
						title: g.title,
						count: g.workflows.length,
						countLabel: t("indexCount", { n: g.workflows.length }),
					}))}
				/>
				<div className={s.atlasBody}>
					<div className={s.atlasHead}>
						<h2 id="fn-list" className={s.h2} data-r="">
							{t("listTitle")}
						</h2>
						<p className={s.atlasLead} data-r="">
							{t("listLead", {
								n: WORKFLOW_COUNT,
								g: WORKFLOW_GROUPS.length,
							})}
						</p>
					</div>
					{WORKFLOW_GROUPS.map((g) => (
						<div key={g.key} id={`bereich-${g.key}`} className={s.group}>
							<div className={s.groupHead} data-r="">
								<h3 className={s.groupTitle}>{g.title}</h3>
								<p className={s.groupLead}>{g.lead}</p>
							</div>
							<ul className={s.rows} data-r="">
								{g.workflows.slice(0, VISIBLE).map((w) => (
									<WorkflowRow
										key={w.key}
										w={w}
										labels={{
											where: t("where"),
											trigger: t("trigger"),
											steps: t("steps"),
											result: t("result"),
										}}
									/>
								))}
							</ul>
							{g.workflows.length > VISIBLE && (
								<details className={s.more}>
									<summary className={s.moreHead}>
										{t("listMore", { n: g.workflows.length })}
										<ChevronRight className={s.rowChevron} aria-hidden="true" />
									</summary>
									<ul className={s.rows}>
										{g.workflows.slice(VISIBLE).map((w) => (
											<WorkflowRow
												key={w.key}
												w={w}
												labels={{
													where: t("where"),
													trigger: t("trigger"),
													steps: t("steps"),
													result: t("result"),
												}}
											/>
										))}
									</ul>
								</details>
							)}
						</div>
					))}
				</div>
			</section>

			{/* Was gilt für dich? Nicht jedes Rahmenwerk muss jede:r umsetzen */}
			<section id="fuer-wen" className={s.fit} aria-labelledby="fn-fit">
				<div className={s.fitHead}>
					<h2 id="fn-fit" className={s.h2} data-r="">
						{t("audienceTitle")}
					</h2>
					<p className={s.fitLead} data-r="">
						{t("audienceLead")}
					</p>
				</div>
				<AudienceGuide audiences={audienceViews()} initial={AUDIENCE_DEFAULT} />
				<div className={s.fitNotes}>
					<p>{t("audienceRest")}</p>
					<p>
						{t("audienceCatalog", {
							n: totals.frameworks,
							r: totals.requirements,
							c: totals.controls,
						})}{" "}
						{t("audienceNote")}
					</p>
					<p>
						<Link href="/einfach-erklaert" className="hit-area">
							{t("relationsLink")}
						</Link>
					</p>
				</div>
			</section>

			{/* Abschluss: eine Fläche mit der Hauptaktion */}
			<section className={s.cta} aria-labelledby="fn-cta">
				<div className={s.ctaMain} data-r="">
					<h2 id="fn-cta" className={s.ctaTitle}>
						{t("ctaTitle")}
					</h2>
					<p>{t("ctaLead")}</p>
					<div className={s.ctaActions}>
						<Link
							href="/leistungen#anfrage"
							className={cn(s.button, s.buttonInverse)}
						>
							{t("ctaAction")}
						</Link>
						<Link href="/login" className={`hit-area ${s.ctaLink}`}>
							{t("ctaLogin")}
						</Link>
					</div>
				</div>
			</section>
		</RevealRoot>
	);
}

// Ein Ablauf als aufklappbare Zeile: Auslöser, Schritte, Ergebnis
function WorkflowRow({
	w,
	labels,
}: {
	w: Workflow;
	labels: { where: string; trigger: string; steps: string; result: string };
}) {
	return (
		<li>
			<details className={s.row}>
				<summary className={s.rowHead}>
					<span className={s.rowText}>
						<span className={s.rowName}>{w.name}</span>
						<span className={s.rowWhere}>
							<span className="sr-only">{labels.where}: </span>
							{w.where}
						</span>
					</span>
					<ChevronRight className={s.rowChevron} aria-hidden="true" />
				</summary>
				<div className={s.rowBody}>
					<p>{w.summary}</p>
					<div className={s.rowPart}>
						<p className={s.rowLabel}>{labels.trigger}</p>
						<p>{w.trigger}</p>
					</div>
					<div className={s.rowPart}>
						<p className={s.rowLabel}>{labels.steps}</p>
						<ol className={s.rowSteps}>
							{w.steps.map((step) => (
								<li key={step}>{step}</li>
							))}
						</ol>
					</div>
					<div className={s.rowPart}>
						<p className={s.rowLabel}>{labels.result}</p>
						<p>{w.result}</p>
					</div>
				</div>
			</details>
		</li>
	);
}

export default withMessages(FeaturesPage, ["Features"]);
