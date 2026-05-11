"use client";

import { Languages, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
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
// Klick → übersetzt den aktuellen Text in die UI-Locale und ruft setText.
// Speichert noch nichts — der User muss aktiv auf "Speichern" klicken.
export function ProfileFieldTranslate({
	currentText,
	setText,
	context,
}: {
	currentText: string;
	setText: (next: string) => void;
	context?: string;
}) {
	const t = useTranslations("Translate");
	const localeRaw = useLocale();
	const to: "de" | "en" = localeRaw === "de" ? "de" : "en";
	const [isPending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);

	if (!currentText?.trim()) return null;
	const from: "de" | "en" = looksGerman(currentText) ? "de" : "en";
	if (from === to) return null;

	function handle() {
		setError(null);
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
			setText(r.texts[0] ?? currentText);
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
// einem einzigen API-Call und schreibt sie zurück.
// Type stammt aus db/schema, damit hier kein paralleles Shape-Driften
// entsteht — siehe CLAUDE.md.
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

	const descriptions = items.map((i) => i.description ?? "");
	const joined = descriptions.join(" ");
	if (!joined.trim()) return null;
	const from: "de" | "en" = looksGerman(joined) ? "de" : "en";
	if (from === to) return null;

	function handle() {
		setError(null);
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
			setItems(
				items.map((it, i) => ({
					...it,
					description: r.texts[i] ?? it.description,
				})),
			);
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
