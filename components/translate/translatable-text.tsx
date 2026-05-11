"use client";

import { Languages, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { translateTexts } from "@/app/actions/translate";

// Heuristik: deutsch-aussehend? Reicht um den Button-Hinweis zu zeigen.
// Falls falsch erkannt: Button erscheint trotzdem, übersetzt das Modell
// halt 1:1 zurück — kein Schaden.
function looksGerman(text: string): boolean {
	const t = text.toLowerCase();
	if (/[äöüß]/.test(t)) return true;
	return /\b(und|der|die|das|für|mit|von|über|ist|hat|nicht|kann|werden|sein|wir|euch|euer|unser|sie|ihr)\b/.test(
		t,
	);
}

// All-in-one: nimmt einen Freitext, prüft ob die Sprache zur UI-Locale
// passt; wenn nicht, blendet einen Translate-Button neben dem Text ein.
// Klick → ersetzt den Text durch die Übersetzung. Mount-cached.
//
// Verwendung:
//   <TranslatableText text={app.coverLetter} context="Bewerbungs-Anschreiben" />
//
// `as` erlaubt p / span / div Wrapper (Default: p mit Standard-Klassen).
export function TranslatableText({
	text,
	context,
	from: forcedFrom,
	className,
	multiline = true,
}: {
	text: string | null | undefined;
	context?: string;
	// Optional: feste Source-Sprache (skips heuristics). Wenn nicht
	// gesetzt, raten wir aus dem Text.
	from?: "de" | "en";
	className?: string;
	multiline?: boolean;
}) {
	const t = useTranslations("Translate");
	const localeRaw = useLocale();
	const to: "de" | "en" = localeRaw === "de" ? "de" : "en";
	const [current, setCurrent] = useState<string>(text ?? "");
	const [translated, setTranslated] = useState(false);
	const [isPending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);

	if (!text) return null;

	const from: "de" | "en" =
		forcedFrom ?? (looksGerman(current) ? "de" : "en");
	const needsTranslate = !translated && from !== to;

	function handle() {
		setError(null);
		startTransition(async () => {
			const r = await translateTexts({
				texts: [current],
				from,
				to,
				context,
			});
			if (!r.ok) {
				setError(r.error);
				return;
			}
			setCurrent(r.texts[0] ?? current);
			setTranslated(true);
		});
	}

	const baseClass =
		className ??
		(multiline
			? "whitespace-pre-wrap text-foreground/90 text-sm leading-relaxed"
			: "text-foreground/90 text-sm");

	return (
		<div className="space-y-2">
			<p className={baseClass}>{current}</p>
			{needsTranslate && (
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={handle}
						disabled={isPending}
						className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 font-mono text-[10px] text-primary hover:bg-primary/10 disabled:opacity-50"
					>
						{isPending ? (
							<Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.5} />
						) : (
							<Languages className="h-3 w-3" strokeWidth={1.5} />
						)}
						{t("translate", { to: to.toUpperCase() })}
					</button>
					{error && (
						<span className="text-rose-700 text-xs dark:text-rose-300">
							{error}
						</span>
					)}
				</div>
			)}
		</div>
	);
}
