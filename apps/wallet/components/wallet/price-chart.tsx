"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";

// Kursverlauf (Dataviz-Regeln): eine Reihe, Linie 2 px in --chart-1, Fläche
// als 10-%-Hauch, Achsen/Gitter als Haarlinien. Eingänge ● gefüllt,
// Ausgänge ○ hohl — Form trägt die Bedeutung (Legende darüber), 2-px-Ring in
// der Flächenfarbe. Fadenkreuz rastet auf den nächsten Kurspunkt; Pfeiltasten
// bewegen es, Markierungen sind einzeln fokussierbar. Werte nur zur
// Darstellung als Zahl — gerechnet wird auf dem Server mit BigInt.

export type ChartPoint = { t: number; v: number };
export type ChartMarker = {
	id: string;
	t: number;
	v: number;
	dir: "in" | "out";
	// fertige Texte vom Server (Betrag, Kurs, Wert)
	title: string;
	lines: string[];
};

const H = 260;
const M = { top: 12, right: 64, bottom: 26, left: 4 };

function niceStep(span: number, target: number): number {
	const raw = span / Math.max(1, target);
	const mag = 10 ** Math.floor(Math.log10(raw));
	const norm = raw / mag;
	return (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
}

function nearest(points: ChartPoint[], t: number): number {
	let lo = 0;
	let hi = points.length - 1;
	while (hi - lo > 1) {
		const mid = (lo + hi) >> 1;
		if ((points[mid] as ChartPoint).t < t) lo = mid;
		else hi = mid;
	}
	const a = points[lo] as ChartPoint;
	const b = points[hi] as ChartPoint;
	return Math.abs(a.t - t) <= Math.abs(b.t - t) ? lo : hi;
}

// höchstens ~2 Punkte je Pixelspalte zeichnen (Extremwerte bleiben)
function thin(points: ChartPoint[], width: number): ChartPoint[] {
	if (points.length <= width * 2) return points;
	const out: ChartPoint[] = [];
	const per = points.length / width;
	for (let c = 0; c < width; c += 1) {
		const slice = points.slice(Math.floor(c * per), Math.floor((c + 1) * per));
		if (slice.length === 0) continue;
		let min = slice[0] as ChartPoint;
		let max = slice[0] as ChartPoint;
		for (const p of slice) {
			if (p.v < min.v) min = p;
			if (p.v > max.v) max = p;
		}
		out.push(...(min.t <= max.t ? [min, max] : [max, min]));
	}
	return out;
}

export function PriceChart({
	points,
	markers,
	currency,
	timeFormat,
	label,
}: {
	points: ChartPoint[];
	markers: ChartMarker[];
	currency: "EUR" | "USD";
	timeFormat: "time" | "day" | "month";
	label: string;
}) {
	const t = useTranslations("Wallet");
	const box = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState(0);
	const [hover, setHover] = useState<number | null>(null);
	const [focusMarker, setFocusMarker] = useState<string | null>(null);
	const [sliderFocus, setSliderFocus] = useState(false);

	useEffect(() => {
		const el = box.current;
		if (!el) return;
		const ro = new ResizeObserver(([e]) =>
			setWidth(Math.round(e?.contentRect.width ?? 0)),
		);
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	const fmtValue = useMemo(
		() =>
			new Intl.NumberFormat("de-DE", {
				style: "currency",
				currency,
				maximumFractionDigits: 2,
			}),
		[currency],
	);
	const fmtAxis = useMemo(
		() =>
			new Intl.NumberFormat("de-DE", {
				notation: "compact",
				maximumFractionDigits: 2,
			}),
		[],
	);
	const fmtTime = useMemo(
		() =>
			new Intl.DateTimeFormat(
				"de-DE",
				timeFormat === "time"
					? { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" }
					: timeFormat === "day"
						? { day: "numeric", month: "short", timeZone: "Europe/Berlin" }
						: { month: "short", year: "2-digit", timeZone: "Europe/Berlin" },
			),
		[timeFormat],
	);
	const fmtFull = useMemo(
		() =>
			new Intl.DateTimeFormat("de-DE", {
				dateStyle: "medium",
				timeStyle: "short",
				timeZone: "Europe/Berlin",
			}),
		[],
	);

	const plotW = Math.max(0, width - M.left - M.right);
	const plotH = H - M.top - M.bottom;
	const geo = useMemo(() => {
		if (points.length < 2 || plotW <= 0) return null;
		const t0 = (points[0] as ChartPoint).t;
		const t1 = (points[points.length - 1] as ChartPoint).t;
		let lo = Math.min(...points.map((p) => p.v), ...markers.map((m) => m.v));
		let hi = Math.max(...points.map((p) => p.v), ...markers.map((m) => m.v));
		const pad = (hi - lo || hi * 0.01 || 1) * 0.08;
		lo -= pad;
		hi += pad;
		const x = (tt: number) => M.left + ((tt - t0) / (t1 - t0 || 1)) * plotW;
		const y = (v: number) => M.top + (1 - (v - lo) / (hi - lo)) * plotH;
		const drawn = thin(points, plotW);
		const line = drawn
			.map(
				(p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`,
			)
			.join("");
		const area = `${line}L${x(t1).toFixed(1)},${M.top + plotH}L${x(t0).toFixed(1)},${M.top + plotH}Z`;
		const step = niceStep(hi - lo, 4);
		const yTicks: number[] = [];
		for (let v = Math.ceil(lo / step) * step; v <= hi; v += step)
			yTicks.push(v);
		const xCount = Math.max(2, Math.min(5, Math.floor(plotW / 110)));
		const xTicks = Array.from(
			{ length: xCount },
			(_, i) => t0 + ((t1 - t0) * (i + 0.5)) / xCount,
		);
		return { x, y, line, area, yTicks, xTicks };
	}, [points, markers, plotW, plotH]);

	const active = hover !== null ? points[hover] : null;
	const shown = active ?? points[points.length - 1] ?? null;
	const marker = markers.find((m) => m.id === focusMarker) ?? null;

	function onMove(e: React.PointerEvent<SVGRectElement>) {
		if (!geo || points.length === 0) return;
		const rect = e.currentTarget.getBoundingClientRect();
		const px = e.clientX - rect.left;
		const t0 = (points[0] as ChartPoint).t;
		const t1 = (points[points.length - 1] as ChartPoint).t;
		const tt = t0 + (px / Math.max(1, rect.width)) * (t1 - t0);
		setHover(nearest(points, tt));
		// Markierung in Reichweite (12 px) gewinnt den Tooltip
		const near = markers.find(
			(m) => Math.abs(geo.x(m.t) - (M.left + px)) <= 12,
		);
		setFocusMarker(near?.id ?? null);
	}

	function onKey(e: React.KeyboardEvent) {
		if (points.length === 0) return;
		const cur = hover ?? points.length - 1;
		const step = e.shiftKey ? 10 : 1;
		if (e.key === "ArrowLeft") setHover(Math.max(0, cur - step));
		else if (e.key === "ArrowRight")
			setHover(Math.min(points.length - 1, cur + step));
		else if (e.key === "Home") setHover(0);
		else if (e.key === "End") setHover(points.length - 1);
		else return;
		setFocusMarker(null);
		e.preventDefault();
	}

	const tipX = marker
		? geo?.x(marker.t)
		: active
			? geo?.x(active.t)
			: undefined;
	const tipLeft =
		tipX !== undefined && width
			? Math.min(Math.max(tipX - 90, 0), width - 184)
			: 0;

	return (
		<div
			ref={box}
			className="relative w-full select-none"
			style={{ height: H }}
		>
			{geo && (
				<svg width={width} height={H}>
					<title>{label}</title>
					{geo.yTicks.map((v) => (
						<g key={v}>
							<line
								x1={M.left}
								x2={M.left + plotW}
								y1={geo.y(v)}
								y2={geo.y(v)}
								stroke="var(--border)"
								strokeWidth={1}
								opacity={0.6}
							/>
							<text
								x={M.left + plotW + 8}
								y={geo.y(v)}
								dy="0.32em"
								className="fill-muted-foreground text-[11px] tabular-nums"
							>
								{fmtAxis.format(v)}
							</text>
						</g>
					))}
					{geo.xTicks.map((tt) => (
						<text
							key={tt}
							x={geo.x(tt)}
							y={H - 6}
							textAnchor="middle"
							className="fill-muted-foreground text-[11px]"
						>
							{fmtTime.format(tt)}
						</text>
					))}
					<path d={geo.area} fill="var(--chart-1)" opacity={0.1} />
					<path
						d={geo.line}
						fill="none"
						stroke="var(--chart-1)"
						strokeWidth={2}
						strokeLinejoin="round"
						strokeLinecap="round"
					/>
					{active && (
						<g pointerEvents="none">
							<line
								x1={geo.x(active.t)}
								x2={geo.x(active.t)}
								y1={M.top}
								y2={M.top + plotH}
								stroke="var(--foreground)"
								strokeWidth={1}
								opacity={0.35}
							/>
							<circle
								cx={geo.x(active.t)}
								cy={geo.y(active.v)}
								r={6}
								fill="var(--card)"
							/>
							<circle
								cx={geo.x(active.t)}
								cy={geo.y(active.v)}
								r={4}
								fill="var(--chart-1)"
							/>
						</g>
					)}
					{/* Fadenkreuz: Zeiger oder Pfeiltasten (Schieberegler über die Punkte) */}
					<rect
						x={M.left}
						y={M.top}
						width={plotW}
						height={plotH}
						fill="transparent"
						stroke={sliderFocus ? "var(--ring)" : "none"}
						strokeWidth={2}
						rx={4}
						role="slider"
						tabIndex={0}
						aria-label={label}
						aria-valuemin={0}
						aria-valuemax={Math.max(0, points.length - 1)}
						aria-valuenow={hover ?? points.length - 1}
						aria-valuetext={
							shown
								? `${fmtFull.format(shown.t)}: ${fmtValue.format(shown.v)}`
								: undefined
						}
						onKeyDown={onKey}
						onFocus={() => setSliderFocus(true)}
						onBlur={() => {
							setSliderFocus(false);
							setHover(null);
						}}
						onPointerMove={onMove}
						onPointerLeave={() => {
							setHover(null);
							setFocusMarker(null);
						}}
						className="outline-none"
					/>
					{markers.map((m) => (
						// biome-ignore lint/a11y/useSemanticElements: SVG-Markierung, per Tastatur fokussierbar
						<g
							key={m.id}
							role="button"
							tabIndex={0}
							aria-label={`${m.title}: ${m.lines.join(", ")}`}
							onFocus={() => setFocusMarker(m.id)}
							onBlur={() => setFocusMarker(null)}
							onPointerEnter={() => setFocusMarker(m.id)}
							className="cursor-pointer outline-none"
						>
							{/* Trefferfläche größer als die Markierung */}
							<circle
								cx={geo.x(m.t)}
								cy={geo.y(m.v)}
								r={12}
								fill="transparent"
							/>
							<circle
								cx={geo.x(m.t)}
								cy={geo.y(m.v)}
								r={7}
								fill="var(--card)"
							/>
							<circle
								cx={geo.x(m.t)}
								cy={geo.y(m.v)}
								r={m.dir === "in" ? 5 : 4}
								fill={m.dir === "in" ? "var(--foreground)" : "var(--card)"}
								stroke="var(--foreground)"
								strokeWidth={m.dir === "in" ? 0 : 2}
							/>
							{focusMarker === m.id && (
								<circle
									cx={geo.x(m.t)}
									cy={geo.y(m.v)}
									r={10}
									fill="none"
									stroke="var(--ring)"
									strokeWidth={2}
								/>
							)}
						</g>
					))}
				</svg>
			)}
			{(marker || active) && tipX !== undefined && (
				<div
					className="pointer-events-none absolute top-0 z-10 w-[184px] rounded-md border border-border/60 bg-popover px-3 py-2 text-footnote shadow-sm"
					style={{ left: tipLeft }}
					aria-live="polite"
				>
					{marker ? (
						<>
							<p className="font-semibold text-subhead">{marker.lines[0]}</p>
							<p className="text-muted-foreground">{marker.title}</p>
							{marker.lines.slice(1).map((l) => (
								<p key={l}>{l}</p>
							))}
						</>
					) : (
						active && (
							<>
								<p className="font-semibold text-subhead tabular-nums">
									{fmtValue.format(active.v)}
								</p>
								<p className="text-muted-foreground">
									{fmtFull.format(active.t)}
								</p>
							</>
						)
					)}
				</div>
			)}
			{!geo && points.length < 2 && width > 0 && (
				<p className="absolute inset-0 flex items-center justify-center text-muted-foreground text-subhead">
					{t("chartEmpty")}
				</p>
			)}
		</div>
	);
}
