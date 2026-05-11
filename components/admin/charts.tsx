// Pure-CSS chart primitives für die Admin-Analytics. Kein Recharts/D3 —
// wir wollen kein zusätzliches JS-Bundle für etwas, das mit Tailwind +
// 30 Zeilen TS auch geht. Alles als Server-Components renderbar.

type BarItem = { label: string; n: number };

function maxOf(items: BarItem[]): number {
	let m = 0;
	for (const i of items) if (i.n > m) m = i.n;
	return m || 1;
}

export function HBarChart({
	items,
	tone = "primary",
	max,
}: {
	items: BarItem[];
	tone?: "primary" | "emerald" | "amber" | "rose";
	max?: number;
}) {
	const m = max ?? maxOf(items);
	const toneClass: Record<string, string> = {
		primary: "bg-primary",
		emerald: "bg-emerald-500",
		amber: "bg-amber-500",
		rose: "bg-rose-500",
	};
	if (items.length === 0) {
		return <p className="text-muted-foreground text-xs italic">Keine Daten.</p>;
	}
	return (
		<ul className="space-y-1.5">
			{items.map((it) => {
				const pct = Math.round((it.n / m) * 100);
				return (
					<li
						key={it.label}
						className="grid grid-cols-[minmax(0,1fr)_3rem] gap-3 text-sm"
					>
						<div className="min-w-0">
							<div className="flex items-baseline justify-between gap-2">
								<span className="truncate">{it.label}</span>
							</div>
							<div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
								<div
									className={`h-full rounded-full ${toneClass[tone]}`}
									style={{ width: `${pct}%` }}
								/>
							</div>
						</div>
						<span className="self-center text-right font-mono text-muted-foreground text-xs tabular-nums">
							{it.n}
						</span>
					</li>
				);
			})}
		</ul>
	);
}

// Histogramm — vertikale Bars für Buckets (für Verteilungen wie Gehalt,
// Years, Match-Score). Mit Anzahl + Bucket-Label drunter.
export function VBarHistogram({ items }: { items: BarItem[] }) {
	const m = maxOf(items);
	if (items.length === 0) {
		return <p className="text-muted-foreground text-xs italic">Keine Daten.</p>;
	}
	return (
		<div className="grid grid-flow-col auto-cols-fr items-end gap-1.5">
			{items.map((it) => {
				const h = Math.round((it.n / m) * 100);
				return (
					<div key={it.label} className="flex flex-col items-center gap-1">
						<span className="font-mono text-[10px] text-muted-foreground tabular-nums">
							{it.n}
						</span>
						<div className="flex h-24 w-full items-end">
							<div
								className="w-full rounded-sm bg-primary"
								style={{ height: `${Math.max(2, h)}%` }}
							/>
						</div>
						<span className="font-mono text-[10px] text-muted-foreground">
							{it.label}
						</span>
					</div>
				);
			})}
		</div>
	);
}

// Funnel-Strom: 4-5 Stufen, jede schmaler als die vorige, basierend
// auf der absoluten Anzahl. Erwartet absteigend sortierte Werte.
export function FunnelChart({
	steps,
}: {
	steps: { label: string; n: number; pct?: number }[];
}) {
	const max = maxOf(steps.map((s) => ({ label: s.label, n: s.n })));
	if (steps.length === 0) return null;
	return (
		<ol className="space-y-1">
			{steps.map((s, idx) => {
				const w = Math.max(8, Math.round((s.n / max) * 100));
				return (
					<li
						key={s.label}
						className="grid grid-cols-[7rem_minmax(0,1fr)_3rem] items-center gap-2 text-sm"
					>
						<span className="text-muted-foreground text-xs">{s.label}</span>
						<div className="h-7 w-full">
							<div
								className="flex h-full items-center rounded-sm bg-primary px-3 text-primary-foreground text-xs"
								style={{ width: `${w}%` }}
							>
								{s.pct !== undefined && (
									<span className="ml-auto font-mono text-[11px] opacity-90">
										{s.pct} %
									</span>
								)}
							</div>
						</div>
						<span className="text-right font-mono text-xs tabular-nums">
							{s.n}
						</span>
						{/* Ein dezenter Connector zur nächsten Stufe */}
						{idx < steps.length - 1 && null}
					</li>
				);
			})}
		</ol>
	);
}

// Mix / Donut-Ersatz: zeigt verschiedene Kategorien als gestackte Bar.
export function StackedBar({
	items,
}: {
	items: { label: string; n: number; tone?: string }[];
}) {
	const total = items.reduce((a, b) => a + b.n, 0);
	if (total === 0) {
		return <p className="text-muted-foreground text-xs italic">Keine Daten.</p>;
	}
	const palette = [
		"bg-primary",
		"bg-emerald-500",
		"bg-amber-500",
		"bg-rose-500",
		"bg-violet-500",
		"bg-cyan-500",
	];
	return (
		<div>
			<div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
				{items.map((it, idx) => {
					const w = (it.n / total) * 100;
					return (
						<div
							key={it.label}
							className={it.tone ?? palette[idx % palette.length]}
							style={{ width: `${w}%` }}
							title={`${it.label}: ${it.n}`}
						/>
					);
				})}
			</div>
			<ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:grid-cols-3">
				{items.map((it, idx) => (
					<li key={it.label} className="flex items-center gap-2">
						<span
							className={`h-2.5 w-2.5 rounded-sm ${
								it.tone ?? palette[idx % palette.length]
							}`}
						/>
						<span className="truncate">{it.label}</span>
						<span className="ml-auto font-mono text-muted-foreground">
							{it.n}
						</span>
					</li>
				))}
			</ul>
		</div>
	);
}
