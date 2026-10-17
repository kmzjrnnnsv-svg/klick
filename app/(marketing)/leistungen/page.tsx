import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { CSSProperties } from "react";
import { RevealRoot } from "@/components/marketing/reveal";
import { FAQ, PLAN_ROWS, PLANS, SERVICES } from "@/lib/marketing/services";
import { cn } from "@/lib/utils";
import s from "./leistungen.module.css";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Services");
	return { title: t("metaTitle"), description: t("metaDescription") };
}

// Bildschirmfotos aus Klick (Beispieldaten), natürliche Größe in Pixeln.
const IMG = {
	portal: { src: "/leistungen/portal.jpg", w: 780, h: 1688 },
	produkt: { src: "/leistungen/produkt.jpg", w: 1408, h: 730 },
	cvss: { src: "/leistungen/cvss.jpg", w: 1344, h: 1620 },
	vertrag: { src: "/leistungen/vertrag.jpg", w: 1376, h: 2154 },
	frage: { src: "/leistungen/frage.jpg", w: 1648, h: 1054 },
	reife: { src: "/leistungen/pruefungsreife.jpg", w: 2200, h: 1040 },
	sicherheit: { src: "/leistungen/sicherheit.jpg", w: 2200, h: 1400 },
	nachtest: { src: "/leistungen/nachtest.jpg", w: 1376, h: 248 },
} as const;
type ImgKey = keyof typeof IMG;
type Frame = { img: ImgKey; label: string; tone: number };

const STRIP = [s.stripBlue, s.stripBrown, s.stripSky, s.stripInk];

// Sechs Spalten, versetzt; Spalten 3–4 tragen das Textfeld.
const COLUMNS: { offset: number; frames: Frame[] }[] = [
	{
		offset: 0,
		frames: [
			{ img: "portal", label: "Lieferant · Fragebogen ohne Konto", tone: 0 },
			{ img: "produkt", label: "CRA · was bis zur Marktreife fehlt", tone: 1 },
			{ img: "cvss", label: "Pentest · Befund mit CVSS", tone: 2 },
		],
	},
	{
		offset: -90,
		frames: [
			{ img: "vertrag", label: "DORA Art. 30 · Vertragsprüfung", tone: 3 },
			{ img: "frage", label: "Gap-Analyse · eine Frage je Control", tone: 0 },
			{ img: "nachtest", label: "Pentest · Nachtest je Befund", tone: 1 },
			{ img: "reife", label: "Prüfungsreife · ISO 27001", tone: 2 },
		],
	},
];
const COLUMNS_RIGHT: { offset: number; frames: Frame[] }[] = [
	{
		offset: -130,
		frames: [
			{ img: "cvss", label: "Befund · CVSS 3.1 berechnet", tone: 1 },
			{ img: "portal", label: "Portal · Antwort ohne Login", tone: 3 },
			{ img: "produkt", label: "CRA · Pflichten mit Stichtag", tone: 0 },
		],
	},
	{
		offset: -20,
		frames: [
			{ img: "frage", label: "Fragebogen · mit Dokumenten", tone: 2 },
			{ img: "vertrag", label: "Klauseln · erfüllt oder fehlt", tone: 0 },
			{ img: "nachtest", label: "Nachtest · bestanden", tone: 3 },
		],
	},
];

function FrameView({
	f,
	eager,
	bare,
}: {
	f: Frame;
	eager?: boolean;
	bare?: boolean;
}) {
	const img = IMG[f.img];
	return (
		<figure className={s.frame} style={{ margin: 0 }}>
			{/* biome-ignore lint/performance/noImgElement: statische Bildschirmfotos, CSP ohne Bild-Optimierer */}
			<img
				src={img.src}
				width={img.w}
				height={img.h}
				alt={f.label}
				loading={eager ? "eager" : "lazy"}
				decoding="async"
			/>
			{!bare && (
				<figcaption className={cn(s.strip, STRIP[f.tone % 4])}>
					{f.label}
				</figcaption>
			)}
		</figure>
	);
}

// Mosaik: ein Bild über Kacheln, fünf Farbkacheln (nie benachbart).
const DESK = { cols: 6, rows: 4 };
const PHONE = { cols: 3, rows: 6 };
function pieceStyle(i: number): CSSProperties {
	const c = i % DESK.cols;
	const r = Math.floor(i / DESK.cols);
	return {
		"--px": `${(c * 100) / (DESK.cols - 1)}%`,
		"--py": `${(r * 100) / (DESK.rows - 1)}%`,
	} as CSSProperties;
}
function phonePieceStyle(i: number): CSSProperties {
	const c = i % PHONE.cols;
	const r = Math.floor(i / PHONE.cols);
	return {
		"--qx": `${(c * 100) / (PHONE.cols - 1)}%`,
		"--qy": `${(r * 100) / (PHONE.rows - 1)}%`,
	} as CSSProperties;
}

export default async function ServicesPage() {
	const t = await getTranslations("Services");
	const contact = process.env.CONTACT_EMAIL;
	const contactHref = contact
		? `mailto:${contact}?subject=${encodeURIComponent("Erstgespräch Klick")}`
		: "/login";
	const contactLabel = contact ? t("ctaContact") : t("ctaStart");
	const imgVars = {
		"--img": `url(${IMG.sicherheit.src})`,
		"--img-phone": `url(${IMG.vertrag.src})`,
	} as CSSProperties;

	// Desktop-Mosaik: Index → Farbkachel
	const deskTiles = new Map<number, "head" | "f1" | "f2" | "f3" | "action">([
		[0, "head"],
		[9, "f1"],
		[13, "f2"],
		[22, "f3"],
		[5, "action"],
	]);
	const phoneTiles = new Map<number, "head" | "f1" | "f2" | "action">([
		[0, "head"],
		[6, "f1"],
		[11, "f2"],
		[16, "action"],
	]);
	const tile = (kind: "head" | "f1" | "f2" | "f3" | "action", phone = false) =>
		kind === "head" ? (
			<div
				key={`${phone ? "p" : "d"}-head`}
				className={cn(s.tileInk, phone && s.headTile)}
			>
				<h2 className={s.mosaicHead}>{t("packageTitle")}</h2>
			</div>
		) : kind === "action" ? (
			<div key={`${phone ? "p" : "d"}-action`} className={s.tileBlue}>
				<p className={cn(s.mosaicFact, s.leadOnly)}>{t("packageActionLead")}</p>
				<Link href="/vertrauen" className={cn(s.link, s.mosaicAction)}>
					{t("packageAction")}
				</Link>
			</div>
		) : (
			<div
				key={`${phone ? "p" : "d"}-${kind}`}
				className={kind === "f2" ? s.tileBrown : s.tileSky}
			>
				<p className={s.mosaicFact}>{t(`package_${kind}`)}</p>
			</div>
		);

	return (
		<RevealRoot className={s.page}>
			{/* Bilderbogen mit Textfeld */}
			<section className={s.hero} aria-labelledby="leistungen-title">
				{COLUMNS.map((col, i) => (
					<div
						key={`l${col.offset}`}
						className={s.col}
						style={{ marginTop: col.offset }}
					>
						{col.frames.map((f) => (
							<FrameView key={f.label} f={f} eager={i === 0} />
						))}
					</div>
				))}
				<div className={cn(s.col, s.wide)} style={{ marginTop: -70 }}>
					<div className={s.wideFrame}>
						<FrameView
							f={{
								img: "sicherheit",
								label: "Security-Check · Ampel und Fristen",
								tone: 3,
							}}
							eager
							bare
						/>
					</div>
					<div className={s.panel}>
						<p className={s.wordmark}>{t("wordmark")}</p>
						<h1 id="leistungen-title">{t("heroSentence")}</h1>
						<ul className={s.panelFacts}>
							<li>{t("heroFact1")}</li>
							<li>{t("heroFact2")}</li>
						</ul>
						<a href={contactHref} className={s.button}>
							{contactLabel}
						</a>
						<nav className={s.panelLinks} aria-label={t("heroLinks")}>
							<a href="#leistungen" className={s.link}>
								{t("linkServices")}
							</a>
							<a href="#preise" className={s.link}>
								{t("linkPrices")}
							</a>
							<Link href="/vertrauen" className={s.link}>
								{t("linkTrust")}
							</Link>
						</nav>
					</div>
					<div className={s.wideFrame}>
						<FrameView
							f={{
								img: "reife",
								label: "Prüfungsreife · was bis zur Prüfung fehlt",
								tone: 0,
							}}
							bare
						/>
					</div>
				</div>
				{COLUMNS_RIGHT.map((col) => (
					<div
						key={`r${col.offset}`}
						className={s.col}
						style={{ marginTop: col.offset }}
					>
						{col.frames.map((f) => (
							<FrameView key={f.label} f={f} />
						))}
					</div>
				))}
			</section>

			{/* Fünf Leistungen als Reiter mit Ablauf (ohne Skript umschaltbar) */}
			<section
				id="leistungen"
				className={cn(s.section, s.svc)}
				aria-labelledby="svc-title"
			>
				<div className={s.headRow}>
					<h2 id="svc-title" data-r="">
						<span className={s.soft}>{t("svcTitle1")}</span>
						<br />
						{t("svcTitle2")}
					</h2>
					<a href={contactHref} className={s.button} data-r="">
						{contactLabel}
					</a>
				</div>
				{SERVICES.map((svc, i) => (
					<input
						key={svc.key}
						type="radio"
						name="service"
						value={svc.key}
						id={`svc-${svc.key}`}
						className={s.radio}
						defaultChecked={i === 0}
						aria-label={svc.name}
					/>
				))}
				<div className={s.svcBody}>
					<div className={s.tabs} data-r="">
						{SERVICES.map((svc) => (
							<label
								key={svc.key}
								htmlFor={`svc-${svc.key}`}
								className={s.tab}
								data-tab={svc.key}
							>
								<span className={s.tabName}>{svc.short}</span>
								<span className={s.tabMeta}>{svc.priceFrom}</span>
							</label>
						))}
					</div>
					<div data-r="" style={{ "--d": "80ms" } as CSSProperties}>
						{SERVICES.map((svc) => (
							<article
								key={svc.key}
								className={s.svcPanel}
								data-panel={svc.key}
								aria-labelledby={`svc-${svc.key}-name`}
							>
								<h3 id={`svc-${svc.key}-name`} className={s.panelTitle}>
									{svc.name}
								</h3>
								{svc.steps.map((step) => (
									<div key={step.title} className={s.band}>
										<span className={s.when}>{step.when}</span>
										<span>
											<span className={s.bandTitle}>{step.title}</span>
											<br />
											<span className={s.bandNote}>{step.note}</span>
										</span>
										{step.files ? (
											<ul className={s.files} aria-label={t("filesLabel")}>
												{step.files.map((f) => (
													<li key={f} className={s.file} translate="no">
														{f}
													</li>
												))}
											</ul>
										) : (
											<span />
										)}
									</div>
								))}
								<div className={s.facts}>
									<div className={cn(s.fact, s.factStrong)}>
										<p className={s.factLabel}>{t("factPrice")}</p>
										<p className={s.factValue}>{svc.priceFrom}</p>
									</div>
									<div className={s.fact}>
										<p className={s.factLabel}>{t("factDuration")}</p>
										<p className={s.factValue}>{svc.duration}</p>
									</div>
									<div className={s.fact}>
										<p className={s.factLabel}>{t("factFits")}</p>
										<p className={s.factValue} style={{ fontSize: 17 }}>
											{svc.fits}
										</p>
									</div>
									<div className={s.fact}>
										<p className={s.factLabel}>{t("factResult")}</p>
										<p className={s.factValue} style={{ fontSize: 17 }}>
											{svc.result}
										</p>
									</div>
								</div>
							</article>
						))}
					</div>
				</div>
			</section>

			{/* Ein Bild über alle Kacheln: das Ergebnis als Paket */}
			<section aria-labelledby="package-title">
				<div className={cn(s.mosaic, s.desk)} style={imgVars} data-block="">
					{Array.from({ length: DESK.cols * DESK.rows }, (_, i) => {
						const kind = deskTiles.get(i);
						if (kind) return tile(kind);
						return (
							<div
								// biome-ignore lint/suspicious/noArrayIndexKey: feste Kachelposition
								key={i}
								className={s.piece}
								aria-hidden="true"
							>
								<div className={s.pieceImg} style={pieceStyle(i)} />
							</div>
						);
					})}
				</div>
				<div className={cn(s.mosaic, s.phone)} style={imgVars} data-block="">
					{Array.from({ length: PHONE.cols * PHONE.rows - 1 }, (_, i) => {
						const kind = phoneTiles.get(i);
						if (kind) return tile(kind, true);
						return (
							<div
								// biome-ignore lint/suspicious/noArrayIndexKey: feste Kachelposition
								key={i}
								className={s.piece}
								aria-hidden="true"
							>
								<div className={s.pieceImg} style={phonePieceStyle(i + 1)} />
							</div>
						);
					})}
				</div>
				<span id="package-title" className="sr-only">
					{t("packageTitle")}
				</span>
			</section>

			{/* Ein Befund, vier Stationen */}
			<section className={s.strip4} aria-labelledby="flow-title">
				{(["f1", "f2", "f3", "f4"] as const).map((f, i) => (
					<div key={f} className={cn(s.field, s[f])}>
						{i === 0 && (
							<h2 id="flow-title" className={s.fieldHead} data-r="">
								{t("flowTitle")}
							</h2>
						)}
						<div className={s.card} data-ui="">
							<span className={s.cardRef}>F-02 · SA-2026-04</span>
							<p className={s.cardTitle}>{t("flowCardTitle")}</p>
							<span className={cn(s.sev, i === 3 && s.done)}>
								{i === 3 ? t("flowDone") : t("flowSeverity")}
							</span>
							<ul className={s.cardRows}>
								<li>CVSS 8,1 · CWE-639</li>
								{i >= 1 && <li>{t("flowOwner")}</li>}
								{i >= 2 && <li>{t("flowFixed")}</li>}
								{i >= 2 && (
									<li>{i === 3 ? t("flowRetestDone") : t("flowRetestOpen")}</li>
								)}
								{i === 3 && <li>{t("flowReport")}</li>}
							</ul>
						</div>
						<p
							className={s.clause}
							data-r=""
							style={{ "--d": `${i * 80}ms` } as CSSProperties}
						>
							{t(`flowClause${i + 1}` as "flowClause1")}
						</p>
					</div>
				))}
			</section>

			{/* Drei Wege als große Tabelle */}
			<section id="preise" className={s.section} aria-labelledby="plans-title">
				<div className={s.tableWrap}>
					<table className={s.table} data-r="">
						<thead>
							<tr>
								<th scope="col" className={s.rowLabel}>
									<h2 id="plans-title" className={s.h2}>
										{t("plansTitle")}
									</h2>
								</th>
								{PLANS.map((p) => (
									<th
										key={p.key}
										scope="col"
										className={p.key === "guided" ? s.rec : undefined}
									>
										<span className={s.planName}>{p.name}</span>
										<span className={s.planPrice}>{p.price}</span>
										<span className={s.planPeriod}>{p.period}</span>
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{PLAN_ROWS.map((row) => (
								<tr key={row.label}>
									<th scope="row">{row.label}</th>
									{row.values.map((v, i) => (
										<td
											key={PLANS[i]?.key}
											className={PLANS[i]?.key === "guided" ? s.rec : undefined}
										>
											{v}
										</td>
									))}
								</tr>
							))}
							<tr>
								<td />
								<td>
									<Link href="/preise" className={s.button}>
										{t("planSelf")}
									</Link>
								</td>
								<td className={s.rec}>
									<a href={contactHref} className={s.button}>
										{contactLabel}
									</a>
								</td>
								<td>
									<a href={contactHref} className={s.button}>
										{t("planDone")}
									</a>
								</td>
							</tr>
						</tbody>
					</table>
					<div className={s.plansPhone}>
						<h2 className={s.h2}>{t("plansTitle")}</h2>
						{PLANS.map((p, i) => (
							<div
								key={p.key}
								className={cn(
									s.planBlock,
									p.key === "guided" && s.planBlockRec,
								)}
							>
								<span className={s.planName}>{p.name}</span>
								<span className={s.planPrice}>{p.price}</span>
								<span className={s.planPeriod}>{p.period}</span>
								<dl>
									{PLAN_ROWS.map((row) => (
										<div key={row.label}>
											<dt>{row.label}</dt>
											<dd>{row.values[i]}</dd>
										</div>
									))}
								</dl>
								{p.key === "self" ? (
									<Link href="/preise" className={s.button}>
										{t("planSelf")}
									</Link>
								) : (
									<a href={contactHref} className={s.button}>
										{p.key === "guided" ? contactLabel : t("planDone")}
									</a>
								)}
							</div>
						))}
					</div>
					<p className={s.priceNote}>{t("priceNote")}</p>
				</div>
			</section>

			{/* Fragen */}
			<section className={s.section} aria-labelledby="faq-title">
				<div className={s.faq}>
					<h2 id="faq-title" className={s.faqHead} data-r="">
						{t("faqTitle")}
					</h2>
					<div className={s.faqList}>
						{FAQ.map((item, i) => (
							<details
								key={item.q}
								name="faq"
								className={s.qa}
								data-r=""
								style={{ "--d": `${i * 60}ms` } as CSSProperties}
							>
								<summary>
									{item.q}
									<span className={s.plus} aria-hidden="true" />
								</summary>
								<p className={s.answer}>{item.a}</p>
							</details>
						))}
					</div>
				</div>
			</section>

			{/* Abschluss: die Aktionskachel */}
			<section className={s.section} aria-labelledby="cta-title">
				<div className={s.ctaRow}>
					<div className={cn(s.ctaSide, s.ctaLeft)} data-r="">
						{/* biome-ignore lint/performance/noImgElement: statisches Bildschirmfoto */}
						<img
							src={IMG.portal.src}
							width={IMG.portal.w}
							height={IMG.portal.h}
							alt={t("ctaImageAlt")}
							loading="lazy"
							decoding="async"
						/>
					</div>
					<div className={s.ctaMain} data-r="">
						<h2 id="cta-title">{t("ctaTitle")}</h2>
						<p>{t("ctaLead")}</p>
						<a href={contactHref} className={cn(s.button, s.buttonInverse)}>
							{contactLabel}
						</a>
					</div>
					<div className={cn(s.ctaSide, s.ctaRight)} data-r="" />
				</div>
			</section>

			{/* Wortzeichen aus Blöcken */}
			<div className={s.mark} aria-hidden="true">
				{[
					["K", "100%", "var(--foreground)"],
					["L", "72%", "var(--primary)"],
					["I", "86%", "var(--brown)"],
					["C", "64%", "var(--primary)"],
					["K", "92%", "var(--foreground)"],
				].map(([letter, height, bg], i) => (
					<span
						// biome-ignore lint/suspicious/noArrayIndexKey: feste Buchstabenfolge
						key={i}
						className={s.block}
						data-r=""
						style={
							{
								height,
								background: bg,
								"--d": `${i * 70}ms`,
							} as CSSProperties
						}
					>
						{letter}
					</span>
				))}
			</div>
			<p className={s.markCredit}>{t("credit")}</p>
		</RevealRoot>
	);
}
