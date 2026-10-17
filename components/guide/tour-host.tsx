"use client";

import { X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { Button } from "@/components/ui/button";
import { type Tour, tourByKey, tourFor } from "@/lib/guide/tours";

const EVENT = "klick:tour";
const SEEN = "klick.tours.seen";

// Tour von überall starten (Seitenhilfe, „Zeig mir wie“).
export function startTour(key: string) {
	window.dispatchEvent(new CustomEvent(EVENT, { detail: key }));
}

function readSeen(): Set<string> {
	try {
		return new Set(JSON.parse(window.localStorage.getItem(SEEN) ?? "[]"));
	} catch {
		return new Set();
	}
}

function markSeen(key: string) {
	try {
		const seen = readSeen();
		seen.add(key);
		window.localStorage.setItem(SEEN, JSON.stringify([...seen]));
	} catch {
		// kein Speicher → Tour kommt beim nächsten Besuch wieder; harmlos
	}
}

type Rect = { top: number; left: number; width: number; height: number };
const PAD = 6;

// Eine Tour zur Zeit; startet per Ereignis, per ?zeig=<tour> oder beim
// ersten Besuch einer Seite (nicht unter Automatisierung: navigator.webdriver).
// Keine Inline-Skripte, keine Fremdbibliothek — Abdunklung per box-shadow.
export function TourHost() {
	const t = useTranslations("Guide");
	const pathname = usePathname();
	const [tour, setTour] = useState<Tour | null>(null);
	const [i, setI] = useState(0);
	const [rect, setRect] = useState<Rect | null>(null);
	const [mobile, setMobile] = useState(false);
	const cardRef = useRef<HTMLDivElement>(null);
	const nextRef = useRef<HTMLButtonElement>(null);

	// Nur Schritte, deren Ziel es auf der Seite gibt
	const steps = tour
		? tour.steps.filter((s) =>
				typeof document === "undefined"
					? true
					: Boolean(document.querySelector(`[data-tour="${s.target}"]`)),
			)
		: [];
	const step = steps[i];

	const close = useCallback(() => {
		if (tour) markSeen(tour.key);
		setTour(null);
		setI(0);
		setRect(null);
	}, [tour]);

	// Start per Ereignis
	useEffect(() => {
		const onStart = (e: Event) => {
			const key = (e as CustomEvent<string>).detail;
			const found = tourByKey(key);
			if (found) {
				setTour(found);
				setI(0);
			}
		};
		window.addEventListener(EVENT, onStart);
		return () => window.removeEventListener(EVENT, onStart);
	}, []);

	// Start per ?zeig= oder erstem Besuch
	useEffect(() => {
		const url = new URL(window.location.href);
		const asked = url.searchParams.get("zeig");
		const found = asked
			? tourByKey(asked)
			: tourFor(pathname, url.searchParams.get("tab"));
		if (!found) return;
		if (!asked && (navigator.webdriver || readSeen().has(found.key))) return;
		const timer = window.setTimeout(() => {
			setTour(found);
			setI(0);
		}, 600);
		return () => window.clearTimeout(timer);
	}, [pathname]);

	// Ziel vermessen (und bei Scroll/Resize nachführen)
	useLayoutEffect(() => {
		if (!step) return;
		const el = document.querySelector<HTMLElement>(
			`[data-tour="${step.target}"]`,
		);
		if (!el) return;
		el.scrollIntoView({ block: "center", behavior: "smooth" });
		const measure = () => {
			const r = el.getBoundingClientRect();
			setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
			setMobile(window.innerWidth < 640);
		};
		measure();
		const timer = window.setTimeout(measure, 350);
		window.addEventListener("resize", measure);
		window.addEventListener("scroll", measure, true);
		return () => {
			window.clearTimeout(timer);
			window.removeEventListener("resize", measure);
			window.removeEventListener("scroll", measure, true);
		};
	}, [step]);

	// Fokus in die Karte, Tastatur: Esc, Enter/→, ←
	const visible = Boolean(rect);
	useEffect(() => {
		if (visible) nextRef.current?.focus();
	}, [visible, step]);
	useEffect(() => {
		if (!step) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") close();
			else if (e.key === "ArrowRight")
				setI((x) => Math.min(x + 1, steps.length - 1));
			else if (e.key === "ArrowLeft") setI((x) => Math.max(x - 1, 0));
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [step, steps.length, close]);

	// Tour ohne passende Ziele: still beenden
	useEffect(() => {
		if (tour && steps.length === 0) close();
	}, [tour, steps.length, close]);

	if (!tour || !step || !rect) return null;
	const last = i === steps.length - 1;
	const title = t(`${tour.key}_${step.key}_title` as "heute_next_title");
	const body = t(`${tour.key}_${step.key}_body` as "heute_next_body");
	const below = rect.top + rect.height + 180 < window.innerHeight;
	const cardStyle = mobile
		? undefined
		: {
				top: below ? rect.top + rect.height + PAD + 10 : undefined,
				bottom: below ? undefined : window.innerHeight - rect.top + PAD + 10,
				left: Math.min(Math.max(16, rect.left), window.innerWidth - 16 - 340),
			};

	return (
		<div className="fixed inset-0 z-[60]">
			{/* Abdunklung mit Aussparung um das Ziel; Klick daneben schließt */}
			<button
				type="button"
				aria-label={t("close")}
				className="absolute inset-0 cursor-default"
				onClick={close}
			/>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute rounded-md ring-2 ring-primary transition-all duration-200 motion-reduce:transition-none"
				style={{
					top: rect.top - PAD,
					left: rect.left - PAD,
					width: rect.width + PAD * 2,
					height: rect.height + PAD * 2,
					boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.45)",
				}}
			/>
			<div
				ref={cardRef}
				role="dialog"
				aria-modal="true"
				aria-labelledby="tour-title"
				aria-describedby="tour-body"
				className={
					mobile
						? "absolute inset-x-0 bottom-0 rounded-t-lg border bg-background p-4 shadow-lg"
						: "absolute w-[340px] rounded-lg border bg-background p-4 shadow-lg"
				}
				style={cardStyle}
			>
				<div className="flex items-start justify-between gap-3">
					<p id="tour-title" className="font-medium">
						{title}
					</p>
					<button
						type="button"
						onClick={close}
						aria-label={t("close")}
						className="text-muted-foreground hover:text-foreground"
					>
						<X className="size-4" />
					</button>
				</div>
				<p id="tour-body" className="mt-1.5 text-muted-foreground text-sm">
					{body}
				</p>
				<div className="mt-4 flex items-center justify-between gap-2">
					<span className="text-muted-foreground text-xs">
						{t("stepOf", { n: i + 1, total: steps.length })}
					</span>
					<div className="flex gap-2">
						{i > 0 && (
							<Button size="sm" variant="ghost" onClick={() => setI(i - 1)}>
								{t("back")}
							</Button>
						)}
						<Button
							ref={nextRef}
							size="sm"
							onClick={() => (last ? close() : setI(i + 1))}
						>
							{last ? t("done") : t("next")}
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}
