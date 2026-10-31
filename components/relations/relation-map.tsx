import { getTranslations } from "next-intl/server";
import { THEME_INFO, type Theme } from "@/lib/compliance/catalog/themes";
import { mapLayout, type ThemeGroup } from "@/lib/compliance/framework-map";
import {
	mapFrameworkName,
	shortFrameworkName,
} from "@/lib/compliance/framework-names";
import s from "./relation-map.module.css";

// Übersicht als Mindmap (Teil Z6), nur zum Überblick: Mitte = Firma,
// innerer Ring = Themen mit Zahl der Maßnahmen, äußerer Ring = Rahmenwerke.
// Eine Linie = ein Rahmenwerk verlangt Maßnahmen in diesem Thema, die
// Breite zeigt wie viele. Antippen führt zur Erklärung. Am Handy steht
// stattdessen die Liste der Themen darunter; die Tabelle ist die
// Alternative ohne Bild. Eine Farbe (Akzent), Breite trägt die Menge.

export async function RelationMap({
	frameworks,
	groups,
	centerLabel,
	frameworkHref,
	themeHref,
}: {
	frameworks: readonly string[];
	groups: readonly ThemeGroup[];
	centerLabel: string;
	frameworkHref: (slug: string) => string;
	themeHref: (theme: Theme) => string;
}) {
	const t = await getTranslations("Relations");
	const layout = mapLayout(frameworks);
	const pos = new Map(layout.themes.map((p) => [p.theme, p]));
	const max = Math.max(1, ...groups.flatMap((g) => [...g.weights.values()]));
	const width = (w: number) => 1 + (5 * w) / max;
	const labelOffset = 12;

	return (
		<figure className={s.wrap}>
			<div>
				<svg
					className={s.map}
					viewBox={`0 0 ${layout.width} ${layout.height}`}
					aria-labelledby="relation-map-title relation-map-desc"
				>
					<title id="relation-map-title">{t("mapTitle")}</title>
					<desc id="relation-map-desc">{t("mapDesc")}</desc>
					<circle
						className={s.ring}
						cx={layout.center.x}
						cy={layout.center.y}
						r={Math.hypot(
							(layout.themes[0]?.x ?? 0) - layout.center.x,
							(layout.themes[0]?.y ?? 0) - layout.center.y,
						)}
					/>
					{layout.frameworks.map((f) => {
						const name = mapFrameworkName(f.slug);
						const fullName = shortFrameworkName(f.slug);
						const lx = f.x + labelOffset * Math.sin(f.angle);
						const ly = f.y - labelOffset * Math.cos(f.angle);
						const w = name.length * 10.6 + 24;
						const hx =
							f.anchor === "start"
								? f.x - 10
								: f.anchor === "end"
									? f.x - w + 10
									: f.x - w / 2;
						const total = groups.reduce(
							(n, g) => n + (g.weights.get(f.slug) ?? 0),
							0,
						);
						return (
							<g key={f.slug} className={s.fw}>
								{groups.map((g) => {
									const n = g.weights.get(f.slug) ?? 0;
									const p = pos.get(g.theme);
									if (!n || !p) return null;
									return (
										<line
											key={g.theme}
											className={s.edge}
											data-t={g.theme}
											x1={p.x}
											y1={p.y}
											x2={f.x}
											y2={f.y}
											strokeWidth={width(n)}
										/>
									);
								})}
								<a href={frameworkHref(f.slug)} className={s.link}>
									<title>
										{t("mapFramework", { name: fullName, n: total })}
									</title>
									<rect
										className={s.hit}
										x={hx}
										y={ly - 16}
										width={w}
										height={32}
										rx={8}
									/>
									<circle className={s.fwDot} cx={f.x} cy={f.y} r={5} />
									<text
										className={s.fwLabel}
										x={lx}
										y={ly}
										textAnchor={f.anchor}
									>
										{name}
									</text>
								</a>
							</g>
						);
					})}
					<circle
						className={s.center}
						cx={layout.center.x}
						cy={layout.center.y}
						r={58}
					/>
					<text
						className={s.centerText}
						x={layout.center.x}
						y={layout.center.y}
					>
						{centerLabel}
					</text>
					{groups.map((g) => {
						const p = pos.get(g.theme);
						if (!p) return null;
						const info = THEME_INFO[g.theme];
						return (
							<a
								key={g.theme}
								href={themeHref(g.theme)}
								className={s.link}
								data-topic={g.theme}
							>
								<title>
									{t("mapTheme", {
										title: info.title,
										n: g.controls.length,
									})}
								</title>
								<rect
									className={s.hit}
									x={p.x - 40}
									y={p.y - 40}
									width={80}
									height={80}
									rx={12}
								/>
								<circle className={s.themeNode} cx={p.x} cy={p.y} r={34} />
								<text className={s.themeCount} x={p.x} y={p.y}>
									{g.controls.length}
								</text>
								<text
									className={s.themeLabel}
									x={p.lx}
									y={p.ly}
									textAnchor={p.anchor}
								>
									{info.short}
								</text>
							</a>
						);
					})}
				</svg>
			</div>
			<figcaption className="text-footnote text-muted-foreground">
				{t("mapCaption")}
			</figcaption>
		</figure>
	);
}

// Dieselben Zahlen als Tabelle: Zeilen = Rahmenwerke, Spalten = Themen
export async function RelationTable({
	frameworks,
	groups,
}: {
	frameworks: readonly string[];
	groups: readonly ThemeGroup[];
}) {
	const t = await getTranslations("Relations");
	return (
		<details className="rounded-2xl bg-card">
			<summary className="flex min-h-11 cursor-pointer items-center px-4 text-subhead font-medium">
				{t("asTable")}
			</summary>
			<div className="overflow-x-auto px-4 pb-4">
				<table className="w-full min-w-max text-footnote">
					<caption className="sr-only">{t("tableCaption")}</caption>
					<thead>
						<tr className="text-left text-muted-foreground">
							<th scope="col" className="py-2 pr-4 font-medium">
								{t("tableFramework")}
							</th>
							{groups.map((g) => (
								<th
									key={g.theme}
									scope="col"
									className="px-2 py-2 text-right font-medium"
								>
									{THEME_INFO[g.theme].short}
								</th>
							))}
						</tr>
					</thead>
					<tbody className="tabular-nums">
						{frameworks.map((f) => (
							<tr key={f} className="border-border/70 border-t">
								<th scope="row" className="py-2 pr-4 text-left font-normal">
									{shortFrameworkName(f)}
								</th>
								{groups.map((g) => (
									<td key={g.theme} className="px-2 py-2 text-right">
										{g.weights.get(f) ?? "–"}
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</details>
	);
}
