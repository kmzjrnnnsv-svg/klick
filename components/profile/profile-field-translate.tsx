"use client";

import { Check, Languages, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { persistTranslation } from "@/app/actions/profile";
import { translateTexts } from "@/app/actions/translate";
import type { ProfileExperience } from "@/db/schema";

function looksGerman(text: string): boolean {
	const t = text.toLowerCase();
	if (/[äöüß]/.test(t)) return true;
	return /\b(und|der|die|das|für|mit|von|über|ist|hat|nicht|kann|werden|sein|wir|euch|euer|unser|sie|ihr)\b/.test(
		t,
	);
}

// Translate-Button für einen freien Textarea-Wert (Summary, Skills-Liste).
// Klick → übersetzt den aktuellen Text in die UI-Locale UND speichert die
// übersetzte Variante sofort in translations[locale][persistAs] in der DB.
// Damit hat jeder spätere Reader (Recruiter / Employer / Public-Share)
// instant Zugriff, ohne dass auf ein nachträgliches Background-Translate
// gewartet werden muss.
//
// persistAs: welcher Feld-Key in translations[locale] beschrieben wird.
// 'summary' für die Summary-Textarea, 'skills' wird hier nicht unterstützt
// weil das Format eine Skill-Array-Struktur erwartet, nicht Freitext.
export function ProfileFieldTranslate({
	currentText,
	setText,
	context,
	persistAs,
}: {
	currentText: string;
	setText: (next: string) => void;
	context?: string;
	persistAs?: "summary" | "headline" | "mobility";
}) {
	const t = useTranslations("Translate");
	const localeRaw = useLocale();
	const to: "de" | "en" = localeRaw === "de" ? "de" : "en";
	const [isPending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);
	const [savedAt, setSavedAt] = useState<number | null>(null);

	if (!currentText?.trim()) return null;
	const from: "de" | "en" = looksGerman(currentText) ? "de" : "en";
	if (from === to) return null;

	function handle() {
		setError(null);
		setSavedAt(null);
		startTransition(async () => {
			const r = await translateTexts({
				texts: [currentText],
				from,
				to,
				context,
			});
			if (!r.ok) {
				setError(r.error);
				return;
			}
			const translated = r.texts[0] ?? currentText;
			setText(translated);

			// Sofort in der DB persistieren — beide Sprachen vorhanden,
			// keine Wartezeit für späteren Reader.
			if (persistAs) {
				const p = await persistTranslation({
					targetLocale: to,
					patch: { [persistAs]: translated },
				});
				if (p.ok) {
					setSavedAt(Date.now());
				} else {
					// Übersetzung im Form-State bleibt erhalten, nur die Persistenz
					// schlug fehl. User kann mit "Save" trotzdem normal speichern.
					console.warn("[translate] persist failed (form-only)", p.error);
				}
			}
		});
	}

	return (
		<div className="flex items-center gap-2">
			<button
				type="button"
				onClick={handle}
				disabled={isPending}
				className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 font-mono text-[10px] text-primary hover:bg-primary/10 disabled:opacity-50"
			>
				{isPending ? (
					<Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.5} />
				) : savedAt && Date.now() - savedAt < 3000 ? (
					<Check className="h-3 w-3 text-emerald-600" strokeWidth={1.5} />
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
	);
}

// Bulk-Translate für die Experience-Liste: übersetzt jede description in
// einem einzigen API-Call. Schreibt sie in den Form-State UND persistiert
// die Übersetzung sofort in translations[locale].experience — instant
// abrufbar für Recruiter.
export function ProfileExperienceTranslate({
	items,
	setItems,
}: {
	items: ProfileExperience[];
	setItems: (next: ProfileExperience[]) => void;
}) {
	const t = useTranslations("Translate");
	const localeRaw = useLocale();
	const to: "de" | "en" = localeRaw === "de" ? "de" : "en";
	const [isPending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);
	const [savedAt, setSavedAt] = useState<number | null>(null);

	const descriptions = items.map((i) => i.description ?? "");
	const joined = descriptions.join(" ");
	if (!joined.trim()) return null;
	const from: "de" | "en" = looksGerman(joined) ? "de" : "en";
	if (from === to) return null;

	function handle() {
		setError(null);
		setSavedAt(null);
		startTransition(async () => {
			const r = await translateTexts({
				texts: descriptions,
				from,
				to,
				context:
					"Beschreibungen einzelner Berufs-Stationen. Firmennamen, Rollen-Titel, Stack-Bezeichnungen unverändert lassen.",
			});
			if (!r.ok) {
				setError(r.error);
				return;
			}
			const updated = items.map((it, i) => ({
				...it,
				description: r.texts[i] ?? it.description,
			}));
			setItems(updated);

			// Sofortige Persistierung in translations[locale].experience —
			// Position-by-Position passend zum Index in items[].
			const p = await persistTranslation({
				targetLocale: to,
				patch: {
					experience: updated.map((it) => ({
						role: it.role,
						description: it.description,
					})),
				},
			});
			if (p.ok) {
				setSavedAt(Date.now());
			} else {
				console.warn("[translate] experience persist failed", p.error);
			}
		});
	}

	return (
		<div className="flex items-center gap-2">
			<button
				type="button"
				onClick={handle}
				disabled={isPending}
				className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 font-mono text-[10px] text-primary hover:bg-primary/10 disabled:opacity-50"
			>
				{isPending ? (
					<Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.5} />
				) : savedAt && Date.now() - savedAt < 3000 ? (
					<Check className="h-3 w-3 text-emerald-600" strokeWidth={1.5} />
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
	);
}
