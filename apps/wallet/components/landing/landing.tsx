import {
	ACCESS,
	COMPLIANCE,
	EVENTS,
	EVENTS_INTRO,
	FAQ,
	GOAL_NOTE,
	HERO,
	PAYOUT,
	PILLARS,
	STAND,
	type StandRow,
	TERMS,
} from "@wallet/lib/landing";
import { TRADING } from "@wallet/lib/trading";
import { Ban, Check, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Fragment } from "react";
import { AccessForm } from "./access-form";
import s from "./landing.module.css";
import { PublicHeader } from "./public-header";

// Öffentliche Startseite (abgemeldet unter „/“), sieben Abschnitte: was
// both.money ist mit dem Stand, Krypto überweisen, der Bot per Prompt, „Was
// passiert, wenn …“, Nachweise, Fragen mit Begriffen und „Zugang anfragen“
// als einzige Hauptaktion. Die Stufen bis zum Zahlungsweg stehen nur im
// Fahrplan. Ohne Skript lesbar: der Ereignis-Umschalter ist eine
// Radio-Gruppe, CSS zeigt die gewählte Antwort; Fragen über <details>.
// Bewegung nur per CSS, nie bei reduzierter Bewegung.
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
						<a
							href="#zugang"
							className={`${button} self-start ${s.rise} ${s.rise3}`}
						>
							{HERO.action}
						</a>
						<p className="max-w-xl text-pretty text-subhead leading-relaxed">
							{HERO.today}
						</p>
					</div>
					<StandCard />
				</section>

				<section
					id="ueberweisen"
					aria-labelledby="bm-payout"
					className="border-t bg-card"
				>
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

						<h3 className="mt-16 font-bold text-title-2">{PILLARS.title}</h3>
						<ul className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
							{PILLARS.items.map((p) => (
								<li
									key={p.key}
									className={`flex flex-col gap-2 border-t pt-4 ${s.reveal}`}
								>
									<p className="font-semibold text-headline">{p.title}</p>
									<p className="text-pretty text-muted-foreground leading-relaxed">
										{p.like}
									</p>
								</li>
							))}
						</ul>

						<div className="mt-12 flex flex-col gap-3 rounded-2xl bg-background p-5 sm:p-6">
							<p className={`${badge} ${TONE.goal}`}>{GOAL_NOTE.label}</p>
							<p className="max-w-3xl text-pretty leading-relaxed">
								{GOAL_NOTE.text}
							</p>
							<Link href="/roadmap" className={`${textLink} self-start`}>
								{GOAL_NOTE.action}
								<ChevronRight className="size-4" aria-hidden />
							</Link>
						</div>
					</div>
				</section>

				<Trading />

				<section aria-labelledby="bm-events" className="border-t">
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

				<section aria-labelledby="bm-faq" className="border-t">
					<div
						className={`${section} grid grid-cols-1 gap-10 lg:grid-cols-[1fr_2fr]`}
					>
						<h2 id="bm-faq" className={heading}>
							{FAQ.title}
						</h2>
						<div className="flex flex-col gap-8">
							<div className="divide-y border-y">
								{FAQ.items.map((item) => (
									<Question key={item.q} q={item.q}>
										<p className="max-w-2xl pb-4 text-pretty text-muted-foreground leading-relaxed">
											{item.a}
										</p>
									</Question>
								))}
							</div>
							<div className="border-y">
								<Question q={TERMS.title}>
									<dl className="grid grid-cols-1 gap-x-8 gap-y-4 pb-5 sm:grid-cols-2">
										{TERMS.items.map((t) => (
											<div key={t.term}>
												<dt className="font-semibold">{t.term}</dt>
												<dd className="mt-1 text-pretty text-muted-foreground leading-relaxed">
													{t.text}
												</dd>
											</div>
										))}
									</dl>
								</Question>
							</div>
						</div>
					</div>
				</section>

				<section
					id="zugang"
					aria-labelledby="bm-access"
					className="border-t bg-card"
				>
					<div
						className={`${section} grid grid-cols-1 items-start gap-10 lg:grid-cols-[1fr_1.4fr]`}
					>
						<div className="flex flex-col gap-4">
							<h2 id="bm-access" className={heading}>
								{ACCESS.title}
							</h2>
							<p className="max-w-md text-pretty text-muted-foreground leading-relaxed">
								{ACCESS.lead}
							</p>
							<p className="flex flex-wrap items-center gap-x-2 text-subhead">
								{ACCESS.invited}
								<Link href="/login" className={textLink}>
									{ACCESS.login}
									<ChevronRight className="size-4" aria-hidden />
								</Link>
							</p>
						</div>
						<AccessForm />
					</div>
				</section>
			</main>
		</>
	);
}

// Frage zum Aufklappen (ohne Skript)
function Question({ q, children }: { q: string; children: React.ReactNode }) {
	return (
		<details className="group py-1">
			<summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 py-3 font-medium focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden">
				{q}
				<span
					className="text-primary text-title-3 leading-none transition-transform group-open:rotate-45"
					aria-hidden
				>
					+
				</span>
			</summary>
			{children}
		</details>
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

				<ol className="mt-14 grid grid-cols-1 gap-x-6 gap-y-8 border-white/30 border-t pt-10 md:grid-cols-2 lg:grid-cols-5">
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
					<PromptFragment />
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
						<span className="min-w-0 text-pretty break-words hyphens-auto">
							{item}
						</span>
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

// Prompt in eigenen Worten, darunter die Regeln, die die KI daraus macht
function PromptFragment() {
	const ex = TRADING.example;
	return (
		<figure className={`${frag} sm:p-6 ${s.reveal}`}>
			<figcaption className="text-muted-foreground text-footnote">
				{ex.label}
			</figcaption>
			<p className={`${fragTitle} mt-1`}>{ex.promptTitle}</p>
			<p className="mt-2 rounded-xl bg-muted px-3 py-2.5 text-pretty text-callout leading-relaxed">
				{ex.prompt}
			</p>
			<p className={`${fragTitle} mt-5`}>{ex.frameTitle}</p>
			<Fields rows={ex.frame} numeric={false} />
			<FakeButton>{ex.frameAction}</FakeButton>
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
			<span
				className="mt-4 inline-flex w-full items-center justify-center rounded-full border border-destructive px-3 py-2 font-semibold text-destructive text-footnote"
				aria-hidden
			>
				{TRADING.example.stopAction}
			</span>
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
