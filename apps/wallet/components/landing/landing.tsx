import {
	BACKEND,
	CLOSE,
	COMPLIANCE,
	EVENTS,
	FAQ,
	HERO,
	PAYOUT,
	ROADMAP_TEASER,
} from "@wallet/lib/landing";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Fragment } from "react";
import s from "./landing.module.css";
import { PublicHeader } from "./public-header";

// Öffentliche Startseite (abgemeldet unter „/“). Ohne Skript: der
// Ereignis-Umschalter ist eine Radio-Gruppe, CSS zeigt die gewählte Antwort;
// Fragen über <details>. Bewegung nur per CSS, nie bei reduzierter Bewegung.
const button =
	"inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2";
const section = "mx-auto w-full max-w-6xl px-4 py-16 sm:py-24";
const heading =
	"text-balance font-serif-display text-4xl text-foreground leading-tight sm:text-5xl";

export function Landing() {
	return (
		<>
			<PublicHeader current="home" />
			<main id="inhalt" className="flex grow flex-col">
				<section
					aria-labelledby="bm-title"
					className="mx-auto grid w-full max-w-6xl grid-cols-1 items-start gap-12 px-4 pt-14 pb-16 sm:pt-20 lg:grid-cols-[1.05fr_1fr] lg:gap-16"
				>
					<div className="flex flex-col gap-7">
						<h1
							id="bm-title"
							className={`text-balance font-serif-display text-5xl leading-[1.02] sm:text-7xl ${s.rise}`}
						>
							{HERO.lines[0]}
							<br />
							<em className="text-primary">{HERO.lines[1]}</em>
						</h1>
						<p
							className={`max-w-xl text-pretty text-lg leading-relaxed ${s.rise} ${s.rise2}`}
						>
							{HERO.lead}
						</p>
						<div
							className={`flex flex-wrap items-center gap-x-5 gap-y-3 ${s.rise} ${s.rise3}`}
						>
							<Link href="/login" className={button}>
								{HERO.action}
							</Link>
							<Link
								href="/roadmap"
								className="inline-flex min-h-11 items-center gap-1.5 font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
							>
								{ROADMAP_TEASER.action}
								<ArrowRight className="size-4" aria-hidden />
							</Link>
						</div>
						<p className="max-w-xl text-muted-foreground text-sm">
							{HERO.note}
						</p>
					</div>
					<EventPicker />
				</section>

				<section aria-labelledby="bm-payout" className="border-t bg-card">
					<div className={section}>
						<h2 id="bm-payout" className={`${heading} ${s.reveal}`}>
							{PAYOUT.title}
						</h2>
						<ol className="mt-12 grid grid-cols-1 gap-10 lg:grid-cols-3 lg:gap-8">
							{PAYOUT.steps.map((step, i) => (
								<li
									key={step.say}
									className={`flex flex-col gap-4 ${s.reveal}`}
								>
									<p className="flex items-baseline gap-3 font-medium text-lg">
										<span
											className="font-serif-display text-3xl text-primary tabular-nums"
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

				<section
					id="einblick"
					aria-labelledby="bm-backend"
					className="border-t"
				>
					<div className={section}>
						<h2 id="bm-backend" className={`${heading} ${s.reveal}`}>
							{BACKEND.title}
						</h2>
						<p className="mt-4 max-w-2xl text-muted-foreground">
							{BACKEND.caption}
						</p>
						<ul className="mt-10 grid grid-cols-1 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 lg:grid-cols-3">
							{BACKEND.parts.map((p) => (
								<li
									key={p.key}
									className={`flex flex-col gap-3 bg-background p-6 ${s.reveal}`}
								>
									<div className="flex flex-wrap items-baseline justify-between gap-2">
										<span className="font-medium">{p.label}</span>
										<span className="inline-flex items-center gap-1.5 text-success text-xs">
											<span
												className="size-1.5 rounded-full bg-success"
												aria-hidden
											/>
											{p.state}
										</span>
									</div>
									<p className="font-mono text-primary text-sm" translate="no">
										{p.value}
									</p>
									<p className="text-pretty text-muted-foreground text-sm leading-relaxed">
										<strong className="font-medium text-foreground">
											{p.note.title}.
										</strong>{" "}
										{p.note.text}
									</p>
								</li>
							))}
						</ul>
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
						<p className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-muted-foreground text-sm">
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
									<h3 className="font-medium text-lg">{g.title}</h3>
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
													<span className="text-muted-foreground text-sm">
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

				<section aria-labelledby="bm-next" className="border-t">
					<div
						className={`${section} grid grid-cols-1 items-end gap-8 lg:grid-cols-[1.4fr_auto]`}
					>
						<div className={s.reveal}>
							<h2 id="bm-next" className={heading}>
								{ROADMAP_TEASER.title}
							</h2>
							<p className="mt-5 max-w-3xl text-pretty text-lg leading-relaxed">
								{ROADMAP_TEASER.text}
							</p>
						</div>
						<Link
							href="/roadmap"
							className={`${button} self-start lg:self-end`}
						>
							{ROADMAP_TEASER.action}
							<ArrowRight className="size-4" aria-hidden />
						</Link>
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
											className="text-primary text-xl leading-none transition-transform group-open:rotate-45"
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
							className="max-w-2xl text-balance font-serif-display text-3xl sm:text-4xl"
						>
							{CLOSE.sentence}
						</h2>
						<Link href="/login" className={button}>
							{CLOSE.action}
						</Link>
					</div>
				</section>
			</main>
		</>
	);
}

// Live-Element: ein Ereignis wählen, beide Seiten lesen (Radio + CSS)
function EventPicker() {
	return (
		<fieldset
			className={`${s.picker} ${s.rise} ${s.rise2} min-w-0 rounded-xl border bg-card p-5 shadow-sm sm:p-7`}
		>
			<legend className="sr-only">Ereignis wählen</legend>
			<p className="font-serif-display text-2xl" aria-hidden>
				Was passiert bei …
			</p>
			<div className="mt-4 flex flex-wrap gap-2">
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
						className={`${s.out} grid-cols-1 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2`}
					>
						<div className="flex flex-col gap-2 bg-background p-4">
							<p className="font-medium text-primary text-sm" translate="no">
								In both.money
							</p>
							<p className="text-pretty text-sm leading-relaxed">{e.wallet}</p>
						</div>
						<div className="flex flex-col gap-2 bg-background p-4">
							<p className="font-medium text-brown text-sm">In Klick</p>
							<p className="text-pretty text-sm leading-relaxed">{e.klick}</p>
						</div>
					</div>
				))}
			</div>
		</fieldset>
	);
}

// Ausschnitte der echten Oberflächen, nachgebaut mit Beispielwerten
const frag = "rounded-lg border bg-background p-4 text-sm shadow-sm";
const fragTitle = "font-serif-display text-xl";

function Fields({ rows }: { rows: [string, React.ReactNode][] }) {
	return (
		<dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
			{rows.map(([k, v]) => (
				<Fragment key={k}>
					<dt className="text-muted-foreground">{k}</dt>
					<dd className="min-w-0 break-words text-right tabular-nums">{v}</dd>
				</Fragment>
			))}
		</dl>
	);
}

function FakeButton({ children }: { children: React.ReactNode }) {
	return (
		<span
			className="mt-4 inline-flex w-full items-center justify-center rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground text-xs"
			aria-hidden
		>
			{children}
		</span>
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
			<p className="font-mono text-muted-foreground text-xs" translate="no">
				approve.both.money
			</p>
			<p className={`${fragTitle} mt-1`}>Auszahlung bestätigen</p>
			<Fields
				rows={[
					["Betrag", "0,0004 BTC"],
					[
						"Ziel",
						<span key="z" className="font-mono text-xs" translate="no">
							tb1q w508 d6qe jxtd …
						</span>,
					],
					[
						"Prüfsumme",
						<span key="p" className="font-mono text-xs" translate="no">
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
			<p className="text-muted-foreground text-xs">
				Klick · Krypto (both.money)
			</p>
			<table className="mt-2 w-full text-left">
				<caption className="sr-only">
					Beispiel: Bewegungen aus both.money in Klick
				</caption>
				<thead>
					<tr className="border-b text-muted-foreground text-xs">
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
