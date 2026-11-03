import {
	CLOSE,
	COMPLIANCE,
	EVENTS,
	EVENTS_INTRO,
	FAQ,
	GOAL,
	HERO,
	MORE,
	PAYOUT,
	PILLARS,
	STAND,
	type StandRow,
	TERMS,
} from "@wallet/lib/landing";
import { STAGES, STATUS_LABEL } from "@wallet/lib/roadmap";
import { TRADING } from "@wallet/lib/trading";
import { Ban, Check, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Fragment } from "react";
import s from "./landing.module.css";
import { PublicHeader } from "./public-header";

// Öffentliche Startseite (abgemeldet unter „/“). Oben, was both.money ist,
// und der Stand in drei Zeilen (heute, geplant, Ziel); dann wie es
// funktioniert, der Bot als eigenes Band, was heute läuft, das Ziel mit den
// Stufen, Nachweise, Begriffe und Fragen. Ohne Skript: der Ereignis-Umschalter
// ist eine Radio-Gruppe, CSS zeigt die gewählte Antwort; Fragen über
// <details>. Bewegung nur per CSS, nie bei reduzierter Bewegung.
const button =
	"inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary-fill px-6 font-semibold text-white transition-[filter] hover:brightness-110 active:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const textLink =
	"inline-flex min-h-11 items-center gap-0.5 font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2";
const section = "mx-auto w-full max-w-6xl px-4 py-16 sm:py-24";
const heading =
	"text-balance font-bold text-title-1 text-foreground leading-tight sm:text-5xl";

// Status-Label wie components/ui/badge.tsx: Punkt in der Statusfarbe, Text in
// der Vordergrundfarbe (AA trotz Tönung)
const TONE: Record<StandRow["tone"], string> = {
	live: "bg-success/12 before:bg-success dark:bg-success/20",
	planned: "bg-primary/12 before:bg-primary dark:bg-primary/20",
	goal: "bg-warning/14 before:bg-warning dark:bg-warning/20",
};
const badge =
	"inline-flex max-w-full items-center gap-1.5 self-start rounded-full px-2.5 py-0.5 font-medium text-footnote text-foreground before:size-1.5 before:shrink-0 before:rounded-full before:content-['']";

export function Landing() {
	return (
		<>
			<PublicHeader current="home" />
			<main id="inhalt" className="flex grow flex-col">
				<section
					aria-labelledby="bm-title"
					className="mx-auto grid w-full max-w-6xl grid-cols-1 items-start gap-12 px-4 pt-14 pb-16 sm:pt-20 lg:grid-cols-[1.2fr_1fr] lg:gap-16"
				>
					<div className="flex flex-col gap-7">
						<h1
							id="bm-title"
							className={`text-balance font-semibold text-4xl leading-[1.06] min-[420px]:text-5xl sm:text-6xl lg:text-5xl xl:text-[3.5rem] ${s.rise}`}
						>
							{HERO.lines[0]}
							<br />
							<span className="text-primary">{HERO.lines[1]}</span>
						</h1>
						<p
							className={`max-w-xl text-pretty text-title-3 leading-relaxed ${s.rise} ${s.rise2}`}
						>
							{HERO.lead}
						</p>
						<div
							className={`flex flex-wrap items-center gap-x-5 gap-y-3 ${s.rise} ${s.rise3}`}
						>
							<Link href="/login" className={button}>
								{HERO.action}
							</Link>
							<Link href="/roadmap" className={textLink}>
								{MORE.action}
								<ChevronRight className="size-4" aria-hidden />
							</Link>
						</div>
						<p className="max-w-xl text-pretty text-subhead leading-relaxed">
							{HERO.today}
						</p>
					</div>
					<StandCard />
				</section>

				<section
					id="so-gehts"
					aria-labelledby="bm-pillars"
					className="border-t bg-card"
				>
					<div className={section}>
						<h2 id="bm-pillars" className={`${heading} ${s.reveal}`}>
							{PILLARS.title}
						</h2>
						<p className="mt-4 max-w-2xl text-pretty text-muted-foreground leading-relaxed">
							{PILLARS.lead}
						</p>
						<ol className="mt-12 grid grid-cols-1 gap-x-8 gap-y-10 md:grid-cols-3">
							{PILLARS.items.map((p, i) => (
								<li
									key={p.key}
									className={`row-span-3 grid grid-rows-subgrid gap-3 ${s.reveal}`}
								>
									<h3 className="flex items-baseline gap-3 font-semibold text-title-3">
										<span
											className="font-bold text-title-1 tabular-nums"
											aria-hidden
										>
											{i + 1}
										</span>
										{p.title}
									</h3>
									<p className="text-pretty leading-relaxed">{p.text}</p>
									<p className="self-start rounded-xl bg-background px-4 py-3 text-pretty text-muted-foreground text-subhead leading-relaxed">
										{p.like}
									</p>
								</li>
							))}
						</ol>
					</div>
				</section>

				<Trading />

				<section aria-labelledby="bm-payout" className="border-t">
					<div className={section}>
						<h2 id="bm-payout" className={`${heading} ${s.reveal}`}>
							{PAYOUT.title}
						</h2>
						<p className="mt-4 max-w-2xl text-pretty text-muted-foreground leading-relaxed">
							{PAYOUT.lead}
						</p>
						<ol className="mt-12 grid grid-cols-1 gap-10 lg:grid-cols-3 lg:gap-8">
							{PAYOUT.steps.map((step, i) => (
								<li
									key={step.say}
									className={`flex flex-col gap-4 ${s.reveal}`}
								>
									<p className="flex items-baseline gap-3 font-semibold text-title-3">
										<span
											className="font-bold text-title-1 tabular-nums"
											aria-hidden
										>
											{i + 1}
										</span>
										{step.say}
									</p>
									{i === 0 && <SendFragment />}
									{i === 1 && <ApproveFragment />}
									{i === 2 && <KlickFragment />}
									<p className="text-pretty text-muted-foreground leading-relaxed">
										{step.answer}
									</p>
								</li>
							))}
						</ol>
					</div>
				</section>

				<section aria-labelledby="bm-events" className="border-t bg-card">
					<div
						className={`${section} grid grid-cols-1 items-start gap-10 lg:grid-cols-[1fr_1.4fr]`}
					>
						<div className={s.reveal}>
							<h2 id="bm-events" className={heading}>
								{EVENTS_INTRO.title}
							</h2>
							<p className="mt-4 max-w-md text-pretty text-muted-foreground leading-relaxed">
								{EVENTS_INTRO.lead}
							</p>
						</div>
						<EventPicker />
					</div>
				</section>

				<section id="ziel" aria-labelledby="bm-goal" className="border-t">
					<div className={section}>
						<p className={`${badge} ${TONE.goal}`}>{GOAL.badge}</p>
						<h2 id="bm-goal" className={`${heading} mt-5 ${s.reveal}`}>
							{GOAL.title}
						</h2>
						<p className="mt-4 max-w-3xl text-pretty text-title-3 leading-relaxed">
							{GOAL.lead}
						</p>
						{/* Zeilen per Subgrid: „Heute“ steht in allen Spalten auf einer Höhe */}
						<ol className="mt-12 grid grid-cols-1 gap-x-8 gap-y-10 md:grid-cols-2 lg:grid-cols-4">
							{GOAL.steps.map((step, i) => (
								<li
									key={step.key}
									className={`row-span-3 grid grid-rows-subgrid gap-3 ${s.reveal}`}
								>
									<p className="flex items-baseline gap-3 font-semibold text-headline">
										<span
											className="font-bold text-title-1 tabular-nums"
											aria-hidden
										>
											{i + 1}
										</span>
										{step.title}
									</p>
									<p className="text-pretty text-muted-foreground leading-relaxed">
										{step.text}
									</p>
									<p className="flex items-baseline gap-2.5 self-start border-t pt-3 text-subhead">
										<span
											className={
												step.live
													? "size-2 shrink-0 translate-y-[-1px] rounded-full bg-primary"
													: "size-2 shrink-0 translate-y-[-1px] rounded-full border border-muted-foreground"
											}
											aria-hidden
										/>
										<span>
											<span className="font-medium">Heute:</span> {step.today}
										</span>
									</p>
								</li>
							))}
						</ol>

						<div className="mt-16 grid grid-cols-1 items-end gap-6 lg:grid-cols-[1.4fr_auto]">
							<div className={s.reveal}>
								<h3 className="font-bold text-title-2">{GOAL.stagesTitle}</h3>
								<p className="mt-3 max-w-3xl text-pretty text-muted-foreground leading-relaxed">
									{GOAL.stagesText}
								</p>
							</div>
							<Link
								href="/roadmap"
								className={`${button} self-start lg:self-end`}
							>
								{GOAL.action}
							</Link>
						</div>
						<ol className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
							{STAGES.map((stage) => (
								<li
									key={stage.key}
									className={`flex flex-col gap-3 rounded-2xl bg-card p-5 ${s.reveal}`}
								>
									<h4 className="text-pretty font-semibold text-headline leading-snug">
										{stage.title}
									</h4>
									<span
										className={`${badge} ${stage.status === "live" ? TONE.live : TONE.goal}`}
									>
										{STATUS_LABEL[stage.status]}
									</span>
									{stage.requires && (
										<p className="text-pretty text-muted-foreground text-subhead leading-relaxed">
											{stage.requires}
										</p>
									)}
								</li>
							))}
						</ol>
					</div>
				</section>

				<section aria-labelledby="bm-comp" className="border-t bg-card">
					<div className={section}>
						<h2 id="bm-comp" className={`${heading} ${s.reveal}`}>
							{COMPLIANCE.title}
						</h2>
						<p className="mt-4 max-w-2xl text-pretty text-muted-foreground leading-relaxed">
							{COMPLIANCE.lead}
						</p>
						<p className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-muted-foreground text-subhead">
							<span className="inline-flex items-center gap-2">
								<span className="size-2 rounded-full bg-primary" aria-hidden />
								läuft heute
							</span>
							<span className="inline-flex items-center gap-2">
								<span
									className="size-2 rounded-full border border-muted-foreground"
									aria-hidden
								/>
								folgt oder ist gesperrt
							</span>
						</p>
						<div className="mt-10 grid grid-cols-1 gap-x-12 gap-y-10 md:grid-cols-2">
							{COMPLIANCE.groups.map((g) => (
								<div key={g.title} className={s.reveal}>
									<h3 className="font-semibold text-title-3">{g.title}</h3>
									<ul className="mt-3 divide-y border-y">
										{g.rows.map((r) => {
											const later = /^(folgt|gesperrt)/.test(r.value);
											return (
												<li
													key={r.name}
													className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3"
												>
													<span className="inline-flex items-baseline gap-2.5">
														<span
															className={
																later
																	? "size-2 shrink-0 translate-y-[-1px] rounded-full border border-muted-foreground"
																	: "size-2 shrink-0 translate-y-[-1px] rounded-full bg-primary"
															}
															aria-hidden
														/>
														{r.name}
														<span className="sr-only">
															{later ? " (folgt)" : " (läuft)"}
														</span>
													</span>
													<span className="text-muted-foreground text-subhead">
														{r.value}
													</span>
												</li>
											);
										})}
									</ul>
								</div>
							))}
						</div>
					</div>
				</section>

				<section aria-labelledby="bm-terms" className="border-t">
					<div className={section}>
						<h2 id="bm-terms" className={`${heading} ${s.reveal}`}>
							{TERMS.title}
						</h2>
						<dl className="mt-10 grid grid-cols-1 gap-x-10 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
							{TERMS.items.map((t) => (
								<div key={t.term} className={`border-t pt-4 ${s.reveal}`}>
									<dt className="font-semibold text-headline">{t.term}</dt>
									<dd className="mt-1.5 text-pretty text-muted-foreground leading-relaxed">
										{t.text}
									</dd>
								</div>
							))}
						</dl>
					</div>
				</section>

				<section aria-labelledby="bm-faq" className="border-t bg-card">
					<div
						className={`${section} grid grid-cols-1 gap-10 lg:grid-cols-[1fr_2fr]`}
					>
						<h2 id="bm-faq" className={heading}>
							{FAQ.title}
						</h2>
						<div className="divide-y border-y">
							{FAQ.items.map((item) => (
								<details key={item.q} className="group py-1">
									<summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 py-3 font-medium focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden">
										{item.q}
										<span
											className="text-primary text-title-3 leading-none transition-transform group-open:rotate-45"
											aria-hidden
										>
											+
										</span>
									</summary>
									<p className="max-w-2xl pb-4 text-pretty text-muted-foreground leading-relaxed">
										{item.a}
									</p>
								</details>
							))}
						</div>
					</div>
				</section>

				<section aria-labelledby="bm-close" className="border-t">
					<div className={`${section} flex flex-col items-start gap-6`}>
						<h2
							id="bm-close"
							className="max-w-2xl text-balance font-bold text-title-1 sm:text-4xl"
						>
							{CLOSE.sentence}
						</h2>
						<div className="flex flex-wrap items-center gap-x-5 gap-y-3">
							<Link href="/login" className={button}>
								{CLOSE.action}
							</Link>
							<Link href="/roadmap" className={textLink}>
								{MORE.action}
								<ChevronRight className="size-4" aria-hidden />
							</Link>
						</div>
						<p className="max-w-xl text-pretty text-muted-foreground text-subhead">
							{MORE.text}
						</p>
					</div>
				</section>
			</main>
		</>
	);
}

// Der Stand in drei Zeilen; jede Zeile führt zu ihrem Abschnitt
function StandCard() {
	return (
		<nav
			aria-labelledby="bm-stand"
			className={`${s.rise} ${s.rise2} min-w-0 rounded-2xl bg-card p-5 shadow-sm sm:p-7`}
		>
			<h2 id="bm-stand" className="font-bold text-title-2">
				{STAND.title}
			</h2>
			<ol className="mt-4 flex flex-col divide-y">
				{STAND.rows.map((row) => (
					<li key={row.key}>
						<a
							href={row.href}
							className="group -mx-2 flex items-center gap-3 rounded-xl px-2 py-4 hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
						>
							<span className="flex min-w-0 grow flex-col gap-1.5">
								<span className={`${badge} ${TONE[row.tone]}`}>
									{row.label}
								</span>
								<span className="font-semibold text-headline">{row.title}</span>
								<span className="text-pretty text-muted-foreground text-subhead leading-relaxed">
									{row.text}
								</span>
							</span>
							<ChevronRight
								className="size-5 shrink-0 text-muted-foreground"
								aria-hidden
							/>
						</a>
					</li>
				))}
			</ol>
		</nav>
	);
}

// Der Bot als eigenes Band: was er tut, wie, was er darf und nie darf, Risiko
function Trading() {
	const onBand =
		"focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2";
	return (
		<section
			id="handeln"
			aria-labelledby="bm-trading"
			className="bg-primary-fill text-white"
		>
			<div className={section}>
				<p
					className={`inline-flex items-center gap-1.5 rounded-full bg-white/16 px-3 py-1 font-medium text-footnote before:size-1.5 before:rounded-full before:bg-white before:content-[''] ${s.reveal}`}
				>
					{TRADING.status}
				</p>
				<h2
					id="bm-trading"
					className={`mt-5 text-balance font-bold text-5xl leading-[1.05] sm:text-6xl ${s.reveal}`}
				>
					{TRADING.title}
				</h2>
				<div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_1fr] lg:gap-16">
					<p className="max-w-2xl text-pretty font-medium text-title-2 leading-snug">
						{TRADING.lead} {TRADING.pairs}
					</p>
					<p className="max-w-md text-pretty leading-relaxed lg:pt-1">
						{TRADING.tokens}
					</p>
				</div>

				<ol className="mt-14 grid grid-cols-1 gap-x-8 gap-y-8 border-white/30 border-t pt-10 md:grid-cols-2 lg:grid-cols-4">
					{TRADING.steps.map((step, i) => (
						<li key={step.title} className={`flex flex-col gap-2 ${s.reveal}`}>
							<p className="flex items-baseline gap-3 font-semibold text-headline">
								<span
									className="font-bold text-title-1 tabular-nums"
									aria-hidden
								>
									{i + 1}
								</span>
								{step.title}
							</p>
							<p className="text-pretty leading-relaxed">{step.text}</p>
						</li>
					))}
				</ol>

				<div className="mt-14 grid grid-cols-1 gap-4 text-foreground lg:grid-cols-2">
					<FrameFragment />
					<BotLogFragment />
				</div>

				<div className="mt-4 grid grid-cols-1 gap-4 text-foreground md:grid-cols-2">
					<RuleList
						title={TRADING.may.title}
						items={TRADING.may.items}
						kind="may"
					/>
					<RuleList
						title={TRADING.never.title}
						items={TRADING.never.items}
						kind="never"
					/>
				</div>

				<div className="mt-10 flex flex-col gap-2 border-white/30 border-t pt-6 sm:max-w-3xl">
					<p className="text-pretty font-medium leading-relaxed">
						{TRADING.risk}
					</p>
					<p className="text-pretty leading-relaxed">{TRADING.customers}</p>
					<Link
						href="/roadmap#handeln"
						className={`mt-2 inline-flex min-h-11 items-center gap-0.5 self-start font-semibold underline underline-offset-4 ${onBand}`}
					>
						Schritte bis zum Bot im Fahrplan
						<ChevronRight className="size-4" aria-hidden />
					</Link>
				</div>
			</div>
		</section>
	);
}

function RuleList({
	title,
	items,
	kind,
}: {
	title: string;
	items: readonly string[];
	kind: "may" | "never";
}) {
	const Icon = kind === "may" ? Check : Ban;
	return (
		<div className={`rounded-2xl bg-card p-5 sm:p-6 ${s.reveal}`}>
			<h3 className="font-semibold text-title-3">{title}</h3>
			<ul className="mt-4 flex flex-col gap-3">
				{items.map((item) => (
					<li key={item} className="flex gap-3 leading-relaxed">
						<Icon
							className={`mt-1 size-5 shrink-0 ${kind === "may" ? "text-success" : "text-warning"}`}
							aria-hidden
						/>
						<span className="text-pretty">{item}</span>
					</li>
				))}
			</ul>
		</div>
	);
}

// Live-Element: ein Ereignis wählen, beide Seiten lesen (Radio + CSS)
function EventPicker() {
	return (
		<fieldset
			className={`${s.picker} min-w-0 rounded-2xl bg-background p-5 sm:p-7`}
		>
			<legend className="sr-only">Ereignis wählen</legend>
			<div className="flex flex-wrap gap-2">
				{EVENTS.map((e, i) => (
					<Fragment key={e.key}>
						<input
							type="radio"
							name="bm-event"
							id={`bm-ev-${e.key}`}
							className={s.pick}
							defaultChecked={i === 0}
						/>
						<label htmlFor={`bm-ev-${e.key}`} className={s.chip}>
							{e.label}
						</label>
					</Fragment>
				))}
			</div>
			<div className="mt-6" aria-live="polite">
				{EVENTS.map((e) => (
					<div
						key={e.key}
						className={`${s.out} grid-cols-1 gap-px overflow-hidden rounded-xl bg-border/60 sm:grid-cols-2`}
					>
						<div className="flex flex-col gap-2 bg-card p-4">
							<p
								className="font-medium text-primary text-subhead"
								translate="no"
							>
								In both.money
							</p>
							<p className="text-pretty leading-relaxed">{e.wallet}</p>
						</div>
						<div className="flex flex-col gap-2 bg-card p-4">
							<p className="font-medium text-primary text-subhead">In Klick</p>
							<p className="text-pretty leading-relaxed">{e.klick}</p>
						</div>
					</div>
				))}
			</div>
		</fieldset>
	);
}

// Ausschnitte der echten Oberflächen, nachgebaut mit Beispielwerten
const frag = "rounded-2xl bg-card p-4 text-subhead shadow-sm";
const fragTitle = "font-semibold text-title-3";

// numeric: Ziffern gleich breit; aus bei Text wie „US-Dollar“ (sonst steht
// der Bindestrich gesperrt)
function Fields({
	rows,
	numeric = true,
}: {
	rows: readonly (readonly [string, React.ReactNode])[];
	numeric?: boolean;
}) {
	return (
		<dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
			{rows.map(([k, v]) => (
				<Fragment key={k}>
					<dt className="text-muted-foreground">{k}</dt>
					<dd
						className={`min-w-0 break-words text-right ${numeric ? "tabular-nums" : ""}`}
					>
						{v}
					</dd>
				</Fragment>
			))}
		</dl>
	);
}

function FakeButton({ children }: { children: React.ReactNode }) {
	return (
		<span
			className="mt-4 inline-flex w-full items-center justify-center rounded-full bg-primary-fill px-3 py-2 font-semibold text-footnote text-white"
			aria-hidden
		>
			{children}
		</span>
	);
}

function FrameFragment() {
	return (
		<figure className={`${frag} sm:p-6 ${s.reveal}`}>
			<figcaption className="text-muted-foreground text-footnote">
				{TRADING.example.label}
			</figcaption>
			<p className={`${fragTitle} mt-1`}>{TRADING.example.frameTitle}</p>
			<Fields rows={TRADING.example.frame} numeric={false} />
			<FakeButton>{TRADING.example.frameAction}</FakeButton>
		</figure>
	);
}

function BotLogFragment() {
	return (
		<figure className={`${frag} sm:p-6 ${s.reveal}`}>
			<figcaption className="text-muted-foreground text-footnote">
				{TRADING.example.label}
			</figcaption>
			<table className="mt-1 w-full text-left">
				<caption className={`${fragTitle} text-left`}>
					{TRADING.example.logTitle}
				</caption>
				<thead>
					<tr className="border-b text-muted-foreground text-footnote">
						<th scope="col" className="py-1.5 font-normal">
							Tausch
						</th>
						<th scope="col" className="py-1.5 text-right font-normal">
							Betrag
						</th>
						<th scope="col" className="py-1.5 text-right font-normal">
							Signer
						</th>
					</tr>
				</thead>
				<tbody>
					{TRADING.example.log.map((row) => {
						const ok = row.state === "unterschrieben";
						return (
							<tr key={row.what} className="border-b last:border-b-0">
								<td className="py-2.5 pr-3">{row.what}</td>
								<td className="whitespace-nowrap py-2.5 text-right">
									{row.amount}
								</td>
								<td
									className={`py-2.5 pl-3 text-right ${ok ? "text-success" : "text-warning"}`}
								>
									{row.state}
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</figure>
	);
}

function SendFragment() {
	return (
		<figure className={frag}>
			<figcaption className="sr-only">
				Beispiel: Formular „Senden“ in both.money
			</figcaption>
			<p className={fragTitle}>Senden</p>
			<Fields
				rows={[
					["An", "Lieferant (Adressbuch)"],
					["Betrag", "0,0004 BTC"],
					["Gebühr höchstens", "0,00005 BTC"],
					["Netz", "Bitcoin Signet"],
				]}
			/>
			<FakeButton>Auszahlung anlegen</FakeButton>
		</figure>
	);
}

function ApproveFragment() {
	return (
		<figure className={frag}>
			<figcaption className="sr-only">
				Beispiel: Bestätigungsseite approve.both.money
			</figcaption>
			<p
				className="font-mono text-muted-foreground text-footnote"
				translate="no"
			>
				approve.both.money
			</p>
			<p className={`${fragTitle} mt-1`}>Auszahlung bestätigen</p>
			<Fields
				rows={[
					["Betrag", "0,0004 BTC"],
					[
						"Ziel",
						<span key="z" className="font-mono text-footnote" translate="no">
							tb1q w508 d6qe jxtd …
						</span>,
					],
					[
						"Prüfsumme",
						<span key="p" className="font-mono text-footnote" translate="no">
							04ac eab3 6423 3507
						</span>,
					],
				]}
			/>
			<FakeButton>Mit Sicherheitsschlüssel bestätigen</FakeButton>
		</figure>
	);
}

function KlickFragment() {
	const rows = [
		["Auszahlung", "0,0004 BTC", "freigegeben"],
		["Ausgang", "0,0004 BTC", "bestätigt"],
		["Eingang", "0,01 BTC", "bestätigt"],
	];
	return (
		<figure className={frag}>
			<p className="text-muted-foreground text-footnote">
				Klick · Krypto (both.money)
			</p>
			<table className="mt-2 w-full text-left">
				<caption className="sr-only">
					Beispiel: Bewegungen aus both.money in Klick
				</caption>
				<thead>
					<tr className="border-b text-muted-foreground text-footnote">
						<th scope="col" className="py-1.5 font-normal">
							Art
						</th>
						<th scope="col" className="py-1.5 text-right font-normal">
							Betrag
						</th>
						<th scope="col" className="py-1.5 text-right font-normal">
							Stand
						</th>
					</tr>
				</thead>
				<tbody>
					{rows.map(([kind, amount, state]) => (
						<tr key={kind} className="border-b last:border-b-0">
							<td className="py-2">{kind}</td>
							<td className="py-2 text-right tabular-nums">{amount}</td>
							<td className="py-2 text-right text-success">{state}</td>
						</tr>
					))}
				</tbody>
			</table>
		</figure>
	);
}
