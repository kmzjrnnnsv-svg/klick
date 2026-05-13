"use client";

import { Check, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { parseCvFromVault } from "@/app/actions/profile";
import { Button } from "@/components/ui/button";
import type { ExtractedProfile } from "@/lib/ai";
import { cn } from "@/lib/utils";

type CvItem = { id: string; filename: string; mime: string; createdAt: Date };

// Phasen mit erwarteter Dauer (Ollama qwen2.5:7b auf 8 GB CPU
// braucht 20-60s, je nach CV-Länge). Die Prozentwerte unten zeigen
// den Fortschritt asymptotisch an — wir wissen nicht exakt wann
// Ollama fertig wird, aber der Balken erreicht die 100% nicht
// bis das Server-Action-Promise resolved.
const PHASES = [
	{ key: "phaseUpload", weight: 0.05 },
	{ key: "phaseDecrypt", weight: 0.1 },
	{ key: "phasePdfText", weight: 0.15 },
	{ key: "phaseAi", weight: 0.6 },
	{ key: "phaseSave", weight: 0.1 },
] as const;

// Ollama-Schätzung: 30 Sekunden für mittlere CVs.
const ESTIMATED_DURATION_MS = 30000;

export function CvImporter({
	cvs,
	onExtracted,
}: {
	cvs: CvItem[];
	onExtracted: (data: ExtractedProfile) => void;
}) {
	const t = useTranslations("Profile");
	const [pendingId, setPendingId] = useState<string | null>(null);
	const [progress, setProgress] = useState(0);
	const [phaseIdx, setPhaseIdx] = useState(0);
	const [error, setError] = useState<string | null>(null);
	const [, startTransition] = useTransition();
	const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

	useEffect(() => {
		if (pendingId === null) {
			if (tickRef.current) clearInterval(tickRef.current);
			tickRef.current = null;
			return;
		}
		setProgress(0);
		setPhaseIdx(0);
		const start = Date.now();
		tickRef.current = setInterval(() => {
			const elapsed = Date.now() - start;
			// Asymptotic: 1 - exp(-elapsed / estimated*0.7) reaches 92% at
			// ~estimated, then crawls toward 99% but never hits 100% until
			// the action returns.
			const fraction = 1 - Math.exp(-elapsed / (ESTIMATED_DURATION_MS * 0.7));
			const capped = Math.min(0.99, fraction);
			setProgress(capped);
			// Phase aus kumulativen Gewichten ableiten
			let cum = 0;
			let idx = 0;
			for (let i = 0; i < PHASES.length; i++) {
				cum += PHASES[i].weight;
				if (capped <= cum) {
					idx = i;
					break;
				}
			}
			setPhaseIdx(idx);
		}, 200);
		return () => {
			if (tickRef.current) clearInterval(tickRef.current);
		};
	}, [pendingId]);

	if (cvs.length === 0) {
		return <p className="text-muted-foreground text-sm">{t("noCvHint")}</p>;
	}

	function handleParse(id: string) {
		setError(null);
		setPendingId(id);
		startTransition(async () => {
			try {
				const res = await parseCvFromVault(id);
				if (!res.ok) {
					// Action liefert Result-Pattern — wir sehen den echten Grund
					// statt Next.js' generischer Prod-Wrapper-Message.
					setError(res.error);
					setPendingId(null);
					return;
				}
				setProgress(1);
				setPhaseIdx(PHASES.length - 1);
				setTimeout(() => {
					onExtracted(res.profile);
					setPendingId(null);
				}, 400);
			} catch (e) {
				// Last-resort wenn die Server-Action selber crasht (sollte nicht
				// passieren weil Result-Pattern alles catcht).
				console.error("[cv-importer] action threw", e);
				setError(t("extractFailedGeneric"));
				setPendingId(null);
			}
		});
	}

	return (
		<div className="space-y-3">
			<p className="text-muted-foreground text-xs">{t("importHint")}</p>
			<ul className="space-y-2">
				{cvs.map((cv) => {
					const isPending = pendingId === cv.id;
					return (
						<li
							key={cv.id}
							className={cn(
								"rounded-md border border-border bg-background text-sm",
								isPending && "border-primary/40",
							)}
						>
							<div className="flex items-center gap-3 p-3">
								<span className="flex-1 truncate font-medium">
									{cv.filename}
								</span>
								<Button
									type="button"
									variant="outline"
									size="sm"
									disabled={pendingId !== null}
									onClick={() => handleParse(cv.id)}
								>
									<Sparkles className="h-3.5 w-3.5" strokeWidth={1.5} />
									{isPending ? t("extracting") : t("extract")}
								</Button>
							</div>
							{isPending && (
								<div className="border-border border-t px-3 py-3">
									{/* Progress bar */}
									<div className="relative h-1.5 overflow-hidden rounded-full bg-muted">
										<div
											className="absolute inset-y-0 left-0 bg-primary transition-[width] duration-200 ease-linear"
											style={{ width: `${Math.round(progress * 100)}%` }}
										/>
									</div>
									{/* Phasen + Prozent */}
									<div className="mt-2 flex items-baseline justify-between gap-3">
										<p className="text-muted-foreground text-xs">
											{t(PHASES[phaseIdx].key)}
										</p>
										<span className="font-mono text-[10px] text-muted-foreground tabular-nums">
											{Math.round(progress * 100)} %
										</span>
									</div>
									{/* Phasenliste */}
									<ol className="mt-3 space-y-1">
										{PHASES.map((p, i) => {
											const done = i < phaseIdx || progress >= 1;
											const active = i === phaseIdx && progress < 1;
											return (
												<li
													key={p.key}
													className={cn(
														"flex items-center gap-2 text-[11px]",
														done
															? "text-foreground"
															: active
																? "text-primary"
																: "text-muted-foreground/60",
													)}
												>
													{done ? (
														<Check className="h-3 w-3" strokeWidth={2} />
													) : active ? (
														<span className="inline-block h-3 w-3">
															<span className="block h-1.5 w-1.5 translate-x-[3px] translate-y-[3px] animate-pulse rounded-full bg-primary" />
														</span>
													) : (
														<span className="inline-block h-3 w-3 rounded-full border border-muted-foreground/40" />
													)}
													<span>{t(p.key)}</span>
												</li>
											);
										})}
									</ol>
								</div>
							)}
						</li>
					);
				})}
			</ul>
			{error && (
				<p className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-rose-700 text-xs dark:text-rose-300">
					{error}
				</p>
			)}
		</div>
	);
}
