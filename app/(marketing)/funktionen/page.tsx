import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { CSSProperties } from "react";
import { AtlasIndex } from "@/components/marketing/atlas-index";
import { FrameworkPicker } from "@/components/marketing/framework-picker";
import { PinnedSteps } from "@/components/marketing/pinned-steps";
import { RevealRoot } from "@/components/marketing/reveal";
import { assetUrl } from "@/lib/marketing/asset-url";
import {
	busiestControl,
	catalogTotals,
	evidenceByIsoClause,
	pickerFrameworks,
} from "@/lib/marketing/catalog-facts";
import {
	APPOINTMENT_SAMPLE,
	INCIDENT_SAMPLE,
	PACKAGE_SAMPLE,
	RECON_SAMPLE,
	SAMPLE_ORG,
	SOA_SAMPLE,
} from "@/lib/marketing/feature-samples";
import { SHOTS } from "@/lib/marketing/shots";
import type { PickerFramework } from "@/lib/marketing/synergy";
import {
	FEATURE_FAQ,
	PICKER_DEFAULT,
	WORKFLOW_COUNT,
	WORKFLOW_GROUPS,
} from "@/lib/marketing/workflows";
import { cn } from "@/lib/utils";
import s from "./funktionen.module.css";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Features");
	return { title: t("metaTitle"), description: t("metaDescription") };
}

const OUTPUTS = ["soa", "evidence", "package", "incident", "recon"] as const;
// Rahmenwerke für die Kacheln (Reihenfolge = Anzeige)
const TILE_FRAMEWORKS = [
	"iso27001",
	"dora",
	"nis2",
	"micar",
	"zag",
	"gwg",
	"dsgvo",
	"cra",
	"soc2",
	"ccss",
];

// /funktionen — öffentlich, vor der Anmeldung: jeder Ablauf in Klick mit
// Auslöser, Schritten und Ergebnis, dazu echte Ausschnitte der Oberfläche
// (Richtung „The product performs“, taste-skill). Zahlen aus dem Katalog.
export default async function FeaturesPage() {
	const t = await getTranslations("Features");
	const frameworks = pickerFrameworks();
	const totals = catalogTotals();
	const busiest = busiestControl(["iso27001", "dora", "micar"]);
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

			{/* Ergebnisse: Namen links, das Blatt rechts (ohne Skript umschaltbar) */}
			<section className={s.outputs} aria-labelledby="fn-outputs">
				<h2 id="fn-outputs" className="sr-only">
					{t("outputsTitle")}
				</h2>
				{OUTPUTS.map((o, i) => (
					<input
						key={o}
						type="radio"
						name="output"
						id={`out-${o}`}
						className={s.radio}
						defaultChecked={i === 0}
					/>
				))}
				<div className={s.outputNames} data-r="">
					{OUTPUTS.map((o) => (
						<label key={o} htmlFor={`out-${o}`} className={s.outputName}>
							{t(`out_${o}`)}
						</label>
					))}
					<p className={s.outputNote}>{t("outputsNote")}</p>
				</div>
				<div className={s.sheetStage}>
					<div className={s.sheetSlot} data-sheet="soa">
						<SoaSheet />
					</div>
					<div className={s.sheetSlot} data-sheet="evidence">
						<AppointmentSheet />
					</div>
					<div className={s.sheetSlot} data-sheet="package">
						<PackageSheet />
					</div>
					<div className={s.sheetSlot} data-sheet="incident">
						<IncidentSheet />
					</div>
					<div className={s.sheetSlot} data-sheet="recon">
						<ReconSheet />
					</div>
				</div>
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

			{/* Grundablauf: drei Aussagen, ein angehefteter Ausschnitt */}
			<section className={s.steps} aria-label={t("stepsTitle")}>
				<PinnedSteps
					title={t("stepsTitle")}
					classes={{
						root: s.stepsRoot,
						text: s.stepsText,
						heading: s.stepsHeading,
						step: s.step,
						stepTitle: s.stepTitle,
						stepNote: s.stepNote,
						stage: s.stepsStage,
						state: s.stepsState,
						inline: s.stepInline,
					}}
					steps={[
						{
							title: t("step1"),
							note: t("step1Note"),
							fragment: <ApplicabilityFragment fw={fwBy} />,
						},
						{
							title: t("step2"),
							note: t("step2Note"),
							fragment: busiest ? (
								<ControlFragment control={busiest} fw={fwBy} />
							) : null,
						},
						{
							title: t("step3"),
							note: t("step3Note"),
							fragment: <ReadinessFragment />,
						},
					]}
				/>
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
					{WORKFLOW_GROUPS.map((g, gi) => (
						<div key={g.key} id={`bereich-${g.key}`} className={s.group}>
							<div className={s.groupHead} data-r="">
								<h3 className={s.groupTitle}>{g.title}</h3>
								<p className={s.groupLead}>{g.lead}</p>
							</div>
							<ul className={s.rows} data-r="">
								{g.workflows.map((w) => (
									<li key={w.key}>
										<details className={s.row}>
											<summary className={s.rowHead}>
												<span className={s.rowText}>
													<span className={s.rowName}>{w.name}</span>
													<span className={s.rowWhere}>
														<span className="sr-only">{t("where")}: </span>
														{w.where}
													</span>
												</span>
												<ChevronRight
													className={s.rowChevron}
													aria-hidden="true"
												/>
											</summary>
											<div className={s.rowBody}>
												<p>{w.summary}</p>
												<div className={s.rowPart}>
													<p className={s.rowLabel}>{t("trigger")}</p>
													<p>{w.trigger}</p>
												</div>
												<div className={s.rowPart}>
													<p className={s.rowLabel}>{t("steps")}</p>
													<ol className={s.rowSteps}>
														{w.steps.map((step) => (
															<li key={step}>{step}</li>
														))}
													</ol>
												</div>
												<div className={s.rowPart}>
													<p className={s.rowLabel}>{t("result")}</p>
													<p>{w.result}</p>
												</div>
											</div>
										</details>
									</li>
								))}
							</ul>
							<figure className={s.groupPic} data-r="">
								{/* biome-ignore lint/performance/noImgElement: statische Bildschirmfotos, CSP ohne Bild-Optimierer */}
								<img
									src={assetUrl(g.image.src)}
									width={g.image.w}
									height={g.image.h}
									alt={g.image.alt}
									loading={gi === 0 ? "eager" : "lazy"}
									decoding="async"
								/>
							</figure>
						</div>
					))}
				</div>
			</section>

			{/* Rahmenwerke als Kacheln */}
			<section className={s.proof} aria-labelledby="fn-proof">
				<div className={cn(s.tile, s.tileHead)} data-r="">
					<h2 id="fn-proof" className={s.proofTitle}>
						{t("proofTitle", { n: totals.frameworks })}
					</h2>
					<p>
						{t("proofLead", {
							r: totals.requirements,
							c: totals.controls,
							e: totals.edges,
						})}
					</p>
				</div>
				{TILE_FRAMEWORKS.map((slug, i) => {
					const f = fwBy.get(slug);
					if (!f) return null;
					return (
						<div
							key={slug}
							className={s.tile}
							data-r=""
							style={{ "--d": `${(i % 4) * 60}ms` } as CSSProperties}
						>
							<p className={s.tileName}>{f.label}</p>
						</div>
					);
				})}
				<p className={s.proofMore}>
					{t("proofMore", { n: totals.frameworks - TILE_FRAMEWORKS.length })}
				</p>
			</section>

			{/* Fragen: links die Liste, rechts die Antwort */}
			<section className={s.faq} aria-labelledby="fn-faq">
				<h2 id="fn-faq" className={s.faqWord}>
					{t("faqTitle")}
				</h2>
				{FEATURE_FAQ.map((f, i) => (
					<div key={f.q} className={s.faqItem}>
						<input
							type="radio"
							name="faq"
							id={`faq-${i}`}
							className={s.radio}
							defaultChecked={i === 0}
						/>
						<label htmlFor={`faq-${i}`} className={s.faqQ}>
							<span className={s.faqDot} aria-hidden="true" />
							{f.q}
						</label>
						<p className={s.faqA}>{f.a}</p>
					</div>
				))}
			</section>

			{/* Abschluss: eine Reihe Kacheln */}
			<section className={s.cta} aria-labelledby="fn-cta">
				<div className={s.ctaSide}>
					{/* biome-ignore lint/performance/noImgElement: statisches Bildschirmfoto */}
					<img
						src={assetUrl(SHOTS.verwahrung.src)}
						width={SHOTS.verwahrung.w}
						height={SHOTS.verwahrung.h}
						alt={t("ctaImage")}
						loading="lazy"
						decoding="async"
					/>
				</div>
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
				<div className={cn(s.ctaSide, s.ctaFlat)} />
			</section>
		</RevealRoot>
	);
}

// ── Ergebnis-Blätter (Beispieldaten, data-ui) ─────────────────────────────

function SheetHead({ title, sub }: { title: string; sub: string }) {
	return (
		<div className={s.sheetHead}>
			<p className={s.sheetTitle}>{title}</p>
			<p className={s.sheetSub}>{sub}</p>
		</div>
	);
}

function SoaSheet() {
	return (
		<div className={s.sheet} data-ui="">
			<SheetHead
				title={SOA_SAMPLE.title}
				sub={`${SAMPLE_ORG} · ${SOA_SAMPLE.framework} · Stand ${SOA_SAMPLE.asOf}`}
			/>
			<dl className={s.sheetSums}>
				{SOA_SAMPLE.summary.map((x) => (
					<div key={x.label}>
						<dt>{x.label}</dt>
						<dd>{x.value}</dd>
					</div>
				))}
			</dl>
			<table className={s.sheetTable}>
				<thead>
					<tr>
						<th>Maßnahme</th>
						<th>Stand</th>
						<th>Beleg</th>
					</tr>
				</thead>
				<tbody>
					{SOA_SAMPLE.rows.map((r) => (
						<tr key={r.code}>
							<td>
								<span className={s.code}>{r.code}</span> {r.title}
							</td>
							<td>{r.state}</td>
							<td>{r.proof}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

function PackageSheet() {
	return (
		<div className={s.sheet} data-ui="">
			<SheetHead
				title={PACKAGE_SAMPLE.file}
				sub={`${SAMPLE_ORG} · ${PACKAGE_SAMPLE.exportId} · ${PACKAGE_SAMPLE.total}`}
			/>
			<table className={s.sheetTable}>
				<thead>
					<tr>
						<th>Datei</th>
						<th>Größe</th>
						<th>SHA-256</th>
					</tr>
				</thead>
				<tbody>
					{PACKAGE_SAMPLE.files.map((f) => (
						<tr key={f.name}>
							<td>{f.name}</td>
							<td>{f.size}</td>
							<td>{f.hash}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

function IncidentSheet() {
	return (
		<div className={s.sheet} data-ui="">
			<SheetHead
				title={`${INCIDENT_SAMPLE.code} ${INCIDENT_SAMPLE.title}`}
				sub={`${SAMPLE_ORG} · ${INCIDENT_SAMPLE.regime}`}
			/>
			<dl className={s.sheetSums}>
				{INCIDENT_SAMPLE.facts.map((x) => (
					<div key={x.label}>
						<dt>{x.label}</dt>
						<dd>{x.value}</dd>
					</div>
				))}
			</dl>
			<ul className={s.clocks}>
				{INCIDENT_SAMPLE.clocks.map((c) => (
					<li key={c.label} className={s.clock} data-done={c.done || undefined}>
						<div>
							<p className={s.clockLabel}>{c.label}</p>
							<p className={s.clockRule}>{c.rule}</p>
						</div>
						<div className={s.clockDue}>
							<p>bis {c.due}</p>
							<p className={s.clockState}>{c.state}</p>
						</div>
					</li>
				))}
			</ul>
		</div>
	);
}

function ReconSheet() {
	return (
		<div className={s.sheet} data-ui="">
			<SheetHead
				title={`Abstimmung ${RECON_SAMPLE.day}`}
				sub={`${SAMPLE_ORG} · Bestand on-chain gegen Kundenbuch`}
			/>
			<table className={s.sheetTable}>
				<thead>
					<tr>
						<th>Kryptowert</th>
						<th>on-chain</th>
						<th>Kundenbuch</th>
						<th>Differenz</th>
					</tr>
				</thead>
				<tbody>
					{RECON_SAMPLE.rows.map((r) => (
						<tr
							key={r.symbol}
							data-short={r.state === "Unterdeckung" || undefined}
						>
							<td>{r.symbol}</td>
							<td>{r.onChain}</td>
							<td>{r.ledger}</td>
							<td>
								{r.diff} <span className={s.cellNote}>{r.state}</span>
							</td>
						</tr>
					))}
				</tbody>
			</table>
			<p className={s.sheetAlert}>{RECON_SAMPLE.followUp}</p>
			<p className={s.sheetSub}>{RECON_SAMPLE.people}</p>
		</div>
	);
}

function AppointmentSheet() {
	const a = APPOINTMENT_SAMPLE;
	return (
		<div className={s.sheet} data-ui="">
			<SheetHead
				title={a.title}
				sub={`${SAMPLE_ORG} · ${a.code} · Prüfsumme ${a.hash}`}
			/>
			<p>
				Die Geschäftsleitung bestellt {a.person} mit Wirkung zum {a.from} zur
				Funktion „Geldwäschebeauftragte:r“.
			</p>
			<p className={s.sheetLabel}>Aufgaben</p>
			<ul className={s.sheetList}>
				{a.tasks.map((x) => (
					<li key={x}>{x}</li>
				))}
			</ul>
			<p className={s.sheetLabel}>Berichtsweg</p>
			<p>{a.reportsTo}</p>
			<p className={s.sheetLabel}>Belegt</p>
			<p className={s.sheetSub}>{a.counts.join(" · ")}</p>
			<div className={s.sigs}>
				{a.signatures.map((x) => (
					<div key={x.role} className={s.sig}>
						<p className={s.cellNote}>{x.role}</p>
						<p className={s.sigName}>{x.name}</p>
						<p className={s.sigMeta}>Passkey · {x.at}</p>
					</div>
				))}
			</div>
		</div>
	);
}

// ── Ausschnitte für den Grundablauf (data-ui) ─────────────────────────────

function ApplicabilityFragment({ fw }: { fw: Map<string, PickerFramework> }) {
	const rows = [
		{ slug: "iso27001", on: true, note: "gewählt" },
		{ slug: "dora", on: true, note: "Finanzunternehmen" },
		{ slug: "micar", on: true, note: "Verwahrung, Transfer" },
		{ slug: "gwg", on: true, note: "Verpflichtete:r nach § 2" },
		{ slug: "nis2", on: false, note: "unter den Schwellen" },
	];
	return (
		<div className={s.frag} data-ui="">
			<p className={s.fragTitle}>Anwendbar für {SAMPLE_ORG}</p>
			<p className={s.fragSub}>Stufe 2 · Kryptowerte-Dienstleister</p>
			<ul className={s.fragList}>
				{rows.map((r) => {
					const f = fw.get(r.slug);
					return (
						<li key={r.slug} data-off={r.on ? undefined : ""}>
							<span
								className={s.check}
								data-on={r.on ? "" : undefined}
								aria-hidden="true"
							/>
							<span className={s.fragName}>{f?.label ?? r.slug}</span>
							<span className={s.fragNote}>{r.note}</span>
							<span className={s.fragNum}>{f?.requirements ?? "—"}</span>
						</li>
					);
				})}
			</ul>
		</div>
	);
}

function ControlFragment({
	control,
	fw,
}: {
	control: NonNullable<ReturnType<typeof busiestControl>>;
	fw: Map<string, PickerFramework>;
}) {
	return (
		<div className={s.frag} data-ui="">
			<p className={s.fragSub}>{control.code}</p>
			<p className={s.fragTitle}>{control.title}</p>
			<p className={s.fragStatus}>Umgesetzt</p>
			<p className={s.fragLabel}>Nachweise</p>
			<ul className={s.fragFiles}>
				<li>Informationssicherheitsleitlinie v1.2.pdf</li>
				<li>Beschluss Geschäftsleitung 14.08.2026.pdf</li>
			</ul>
			<p className={s.fragLabel}>
				Deckt {control.requirements} Anforderungen in{" "}
				{control.frameworks.length} Rahmenwerken
			</p>
			<p className={s.fragTags}>
				{control.frameworks.map((f) => fw.get(f)?.label ?? f).join(" · ")}
			</p>
		</div>
	);
}

function ReadinessFragment() {
	const blockers = [
		{ text: "3 Nachweise abgelaufen", gain: "+6" },
		{ text: "Pflichtdokument Risikobehandlungsplan fehlt", gain: "+5" },
		{
			text: "Wirksamkeitstest Zugriffskontrolle älter als 12 Monate",
			gain: "+4",
		},
		{ text: "1 offene Abweichung", gain: "+3" },
	];
	return (
		<div className={s.frag} data-ui="">
			<p className={s.fragTitle}>Prüfungsreife ISO 27001</p>
			<p className={s.fragSub}>Stichtag 31.03.2027</p>
			<p className={s.score}>
				82 <span>von 100</span>
			</p>
			<div className={s.bar} aria-hidden="true">
				<span style={{ width: "82%" }} />
			</div>
			<p className={s.fragLabel}>Blocker nach Punktgewinn</p>
			<ul className={s.fragList}>
				{blockers.map((b) => (
					<li key={b.text}>
						<span className={s.fragName}>{b.text}</span>
						<span className={s.fragNum}>{b.gain}</span>
					</li>
				))}
			</ul>
		</div>
	);
}
