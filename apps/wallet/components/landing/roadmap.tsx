import {
	INTRO,
	LIMITS,
	NEXT,
	NODE_BASICS,
	NODE_SPECS,
	PHASES,
	type RoadmapItem,
	type RoadmapStatus,
	SECTIONS,
	SPEC_DISCLAIMER,
	SPEC_NOTES,
	SPLIT,
	STATUS_LABEL,
	TIERS,
	TODAY,
	WHY_OWN,
} from "@wallet/lib/roadmap";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import s from "./landing.module.css";
import { PublicHeader } from "./public-header";

// Öffentlicher Fahrplan (/roadmap) für Investor:innen und Entwickler:innen:
// Stand heute, nächste Schritte, Phasen, Infrastruktur mit Hardware.
// Druckbar (Kopf und Rücksprung fallen weg).
const section = "mx-auto w-full max-w-6xl px-4 py-14 sm:py-20";
const heading =
	"scroll-mt-6 text-balance font-bold text-title-1 leading-tight sm:text-5xl";

// Status-Label wie components/ui/badge.tsx: Punkt in der Statusfarbe, Text in
// der Vordergrundfarbe (AA trotz Tönung)
const STATUS_STYLE: Record<RoadmapStatus, string> = {
	live: "bg-success/12 before:bg-success dark:bg-success/20",
	ready: "bg-primary/12 before:bg-primary dark:bg-primary/20",
	next: "bg-primary/12 before:bg-primary dark:bg-primary/20",
	planned: "bg-muted before:bg-muted-foreground",
	locked: "bg-warning/14 before:bg-warning dark:bg-warning/20",
};

function StatusBadge({ status }: { status: RoadmapStatus }) {
	return (
		<span
			className={`inline-flex max-w-full shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 font-medium text-footnote text-foreground before:size-1.5 before:rounded-full before:content-[''] ${STATUS_STYLE[status]}`}
		>
			{STATUS_LABEL[status]}
		</span>
	);
}

function Anchors({ item }: { item: RoadmapItem }) {
	return (
		<ul className="flex flex-wrap gap-1.5" aria-label="Zahlt ein auf">
			{item.anchors.map((a) => (
				<li
					key={`${a.framework}-${a.point}`}
					className="rounded-lg bg-muted px-2 py-1 text-footnote"
				>
					<span className="font-medium">{a.framework}</span>
					<span className="text-muted-foreground"> · {a.point}</span>
				</li>
			))}
		</ul>
	);
}

function ItemCard({
	item,
	as = "div",
}: {
	item: RoadmapItem;
	as?: "div" | "li";
}) {
	const Tag = as;
	return (
		<Tag
			className={`flex flex-col gap-3 break-inside-avoid rounded-2xl bg-card p-5 ${s.reveal}`}
		>
			<div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
				<h3 className="min-w-0 font-semibold text-headline leading-snug">
					{item.title}
				</h3>
				<StatusBadge status={item.status} />
			</div>
			<p className="text-pretty text-muted-foreground leading-relaxed">
				{item.text}
			</p>
			{item.requires && (
				<p className="text-subhead">
					<span className="font-medium">Voraussetzung:</span> {item.requires}
				</p>
			)}
			<Anchors item={item} />
		</Tag>
	);
}

export function Roadmap() {
	return (
		<>
			<PublicHeader current="roadmap" />
			<main id="inhalt" className="flex grow flex-col">
				<section aria-labelledby="rm-title" className="border-b">
					<div className={`${section} flex flex-col gap-6`}>
						<h1
							id="rm-title"
							className={`font-semibold text-5xl sm:text-7xl ${s.rise}`}
						>
							{INTRO.title}
						</h1>
						<p
							className={`max-w-3xl text-pretty text-lg leading-relaxed ${s.rise} ${s.rise2}`}
						>
							{INTRO.lead}
						</p>
						<p className="font-medium text-subhead">{INTRO.status}</p>
						<nav aria-label="Abschnitte" className={s.noPrint}>
							<ul className="flex flex-wrap gap-2">
								{SECTIONS.map((x) => (
									<li key={x.id}>
										<a
											href={`#${x.id}`}
											className="inline-flex min-h-9 items-center rounded-full bg-muted px-3.5 text-subhead hover:bg-accent pointer-coarse:min-h-11 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
										>
											{x.label}
										</a>
									</li>
								))}
							</ul>
						</nav>
						<p className="max-w-3xl text-muted-foreground text-subhead">
							{INTRO.note}
						</p>
					</div>
				</section>

				<section aria-labelledby="heute">
					<div className={section}>
						<h2 id="heute" className={heading}>
							Heute
						</h2>
						<p className="mt-4 max-w-2xl text-muted-foreground">
							Was im Testnetz läuft und täglich genutzt wird.
						</p>
						<ul className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2">
							{TODAY.map((item) => (
								<ItemCard key={item.key} item={item} as="li" />
							))}
						</ul>
					</div>
				</section>

				<section aria-labelledby="als-naechstes" className="border-t bg-card">
					<div className={section}>
						<h2 id="als-naechstes" className={heading}>
							Als Nächstes
						</h2>
						<p className="mt-4 max-w-2xl text-muted-foreground">
							In dieser Reihenfolge, ohne feste Termine.
						</p>
						<ol className="mt-10 flex flex-col gap-4">
							{NEXT.map((item, i) => (
								<li
									key={item.key}
									className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-4 sm:grid-cols-[3.5rem_minmax(0,1fr)]"
								>
									<span
										className="pt-4 font-bold text-title-1 tabular-nums sm:text-4xl"
										aria-hidden
									>
										{i + 1}
									</span>
									<ItemCard item={item} />
								</li>
							))}
						</ol>
					</div>
				</section>

				<section aria-labelledby="phasen" className="border-t">
					<div className={section}>
						<h2 id="phasen" className={heading}>
							Phasen
						</h2>
						<p className="mt-4 max-w-2xl text-muted-foreground">
							Größere Ausbaustufen. Verwahrung für Kund:innen ist eingebaut,
							aber gesperrt, bis eine Erlaubnis vorliegt.
						</p>
						<ul className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2">
							{PHASES.map((item) => (
								<ItemCard key={item.key} item={item} as="li" />
							))}
						</ul>
					</div>
				</section>

				<section aria-labelledby="infrastruktur" className="border-t bg-card">
					<div className={section}>
						<h2 id="infrastruktur" className={heading}>
							Infrastruktur und Hardware
						</h2>

						<div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
							<div className="flex flex-col gap-4">
								<h3 className="font-bold text-title-1">{NODE_BASICS.title}</h3>
								{NODE_BASICS.paragraphs.map((p) => (
									<p key={p} className="text-pretty leading-relaxed">
										{p}
									</p>
								))}
							</div>
							<Flow />
						</div>

						<h3 className="mt-16 font-bold text-title-1">
							Warum eigene Knoten
						</h3>
						<ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
							{WHY_OWN.map((r) => (
								<li
									key={r.title}
									className={`flex flex-col gap-2 rounded-2xl bg-card p-5 ${s.reveal}`}
								>
									<p className="font-medium">{r.title}</p>
									<p className="text-pretty text-muted-foreground text-subhead leading-relaxed">
										{r.text}
									</p>
									<p className="mt-auto pt-2 text-primary text-footnote">
										{r.anchor}
									</p>
								</li>
							))}
						</ul>

						<div className="mt-16 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
							<div>
								<h3 className="font-bold text-title-1">{SPLIT.title}</h3>
								<p className="mt-4 text-pretty leading-relaxed">{SPLIT.lead}</p>
								<p className="mt-4 font-medium text-subhead">{SPLIT.note}</p>
							</div>
							<ul className="flex flex-col divide-y border-y">
								{SPLIT.points.map((p) => (
									<li key={p.title} className="py-4">
										<p className="font-medium">{p.title}</p>
										<p className="mt-1 text-pretty text-muted-foreground leading-relaxed">
											{p.text}
										</p>
									</li>
								))}
							</ul>
						</div>

						<h3 className="mt-16 font-bold text-title-1">
							Was die Knoten brauchen
						</h3>
						<p className="mt-3 max-w-3xl text-muted-foreground text-subhead">
							{SPEC_DISCLAIMER}
						</p>
						<div className="mt-6 overflow-x-auto rounded-2xl bg-card">
							<table className="w-full min-w-[44rem] text-left text-subhead">
								<caption className="sr-only">
									Hardware-Richtwerte je Knoten
								</caption>
								<thead>
									<tr className="border-b bg-muted text-muted-foreground">
										<th scope="col" className="px-4 py-3 font-medium">
											Knoten
										</th>
										<th scope="col" className="px-4 py-3 font-medium">
											Platte (NVMe)
										</th>
										<th scope="col" className="px-4 py-3 font-medium">
											Arbeitsspeicher
										</th>
										<th scope="col" className="px-4 py-3 font-medium">
											Prozessor
										</th>
										<th scope="col" className="px-4 py-3 font-medium">
											Wann
										</th>
									</tr>
								</thead>
								<tbody>
									{NODE_SPECS.map((n) => (
										<tr
											key={`${n.chain}-${n.network}`}
											className="border-b last:border-b-0"
										>
											<th
												scope="row"
												className="px-4 py-3 align-top font-normal"
											>
												<span className="font-medium">{n.chain}</span>
												<span className="block text-muted-foreground">
													{n.network}
												</span>
											</th>
											<td className="px-4 py-3 align-top">{n.disk}</td>
											<td className="whitespace-nowrap px-4 py-3 align-top">
												{n.ram}
											</td>
											<td className="whitespace-nowrap px-4 py-3 align-top">
												{n.cpu}
											</td>
											<td className="whitespace-nowrap px-4 py-3 align-top">
												{n.when}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>

						<dl className="mt-8 grid grid-cols-1 gap-x-10 gap-y-6 md:grid-cols-2">
							{SPEC_NOTES.map((n) => (
								<div key={n.title}>
									<dt className="font-medium">{n.title}</dt>
									<dd className="mt-1 text-pretty text-muted-foreground leading-relaxed">
										{n.text}
									</dd>
								</div>
							))}
						</dl>

						<h3 className="mt-16 font-bold text-title-1">Ausbau in Stufen</h3>
						<ol className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
							{TIERS.map((t) => (
								<li
									key={t.key}
									className={`flex flex-col gap-3 break-inside-avoid rounded-2xl bg-card p-5 ${s.reveal}`}
								>
									<div className="flex flex-wrap items-start justify-between gap-2">
										<p className="font-medium text-lg">{t.title}</p>
										<span className="rounded-full border px-2.5 py-0.5 text-muted-foreground text-footnote">
											{t.when}
										</span>
									</div>
									<dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-subhead">
										<dt className="text-muted-foreground">Ausstattung</dt>
										<dd>{t.spec}</dd>
										<dt className="text-muted-foreground">Darauf läuft</dt>
										<dd>{t.runs}</dd>
										<dt className="text-muted-foreground">Wofür</dt>
										<dd>{t.why}</dd>
									</dl>
								</li>
							))}
						</ol>

						<div className="mt-16 rounded-2xl bg-card p-6">
							<h3 className="font-bold text-title-1">{LIMITS.title}</h3>
							<ul className="mt-4 flex flex-col gap-3">
								{LIMITS.points.map((p) => (
									<li key={p} className="flex gap-3 leading-relaxed">
										<span
											className="mt-2.5 size-1.5 shrink-0 rounded-full bg-primary"
											aria-hidden
										/>
										<span className="text-pretty">{p}</span>
									</li>
								))}
							</ul>
						</div>
					</div>
				</section>

				<section aria-label="Hinweis" className="border-t">
					<div className={`${section} flex flex-col items-start gap-6`}>
						<p className="max-w-3xl text-pretty text-muted-foreground">
							{INTRO.note}
						</p>
						<Link
							href="/"
							className={`inline-flex min-h-11 items-center gap-2 font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 ${s.noPrint}`}
						>
							<ArrowLeft className="size-4" aria-hidden />
							Zur Startseite
						</Link>
					</div>
				</section>
			</main>
		</>
	);
}

// Weg einer Zahlung als Bild aus HTML (bricht auf schmalen Bildschirmen um)
function Flow() {
	const steps = [
		{ title: "Netz", text: "Bitcoin, später Ethereum" },
		{ title: "Eigene Knoten", text: "prüfen jeden Block, ohne Schlüssel" },
		{ title: "both.money", text: "Sanktionsprüfung, Konten, Auszahlungen" },
		{ title: "Klick", text: "Nachweise, Abstimmung, Vorfälle" },
	];
	return (
		<figure className="flex flex-col gap-4">
			<ol className="flex flex-col gap-2">
				{steps.map((st, i) => (
					<li key={st.title} className="flex flex-col items-stretch gap-2">
						<div className="flex items-baseline justify-between gap-4 rounded-2xl bg-card px-4 py-3">
							<span
								className="font-medium"
								translate={st.title === "both.money" ? "no" : undefined}
							>
								{st.title}
							</span>
							<span className="text-right text-muted-foreground text-subhead">
								{st.text}
							</span>
						</div>
						{i < steps.length - 1 && (
							<span className="self-center text-primary" aria-hidden>
								↓
							</span>
						)}
					</li>
				))}
			</ol>
			<div className="rounded-xl bg-primary/8 px-4 py-3 text-subhead dark:bg-primary/15">
				<span className="font-medium">Signer, getrennt:</span>{" "}
				<span className="text-muted-foreground">
					unterschreibt Auszahlungen erst nach Freigabe mit Sicherheitsschlüssel
					auf approve.both.money. Ohne Netz, hält die Schlüssel.
				</span>
			</div>
			<figcaption className="text-muted-foreground text-footnote">
				Weg einer Zahlung und Ort der Schlüssel
			</figcaption>
		</figure>
	);
}
