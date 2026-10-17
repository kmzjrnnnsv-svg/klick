"use client";

import { Award } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

const KEY = "klick.journey.celebrated";

// Etappe geschafft: einmal je Gerät ein kleiner Dialog mit Abzeichen.
// localStorage ist nur Komfort (try/catch) — ohne Speicher gibt es eben
// keinen Dialog, der Fortschritt selbst ist abgeleitet.
export function StageCelebration({
	badges,
	labels,
	title,
	lead,
	close,
}: {
	badges: readonly string[];
	labels: Record<string, string>;
	title: string;
	lead: string;
	close: string;
}) {
	const [fresh, setFresh] = useState<string | null>(null);
	useEffect(() => {
		try {
			const seen = new Set<string>(
				JSON.parse(window.localStorage.getItem(KEY) ?? "[]"),
			);
			// Erster Besuch: vorhandene Abzeichen still übernehmen
			const first = !window.localStorage.getItem(KEY);
			const newest = badges.filter((b) => !seen.has(b)).at(-1) ?? null;
			window.localStorage.setItem(KEY, JSON.stringify([...badges]));
			if (!first && newest) setFresh(newest);
		} catch {
			// kein Speicher (privates Fenster) → kein Dialog
		}
	}, [badges]);
	return (
		<Dialog open={fresh !== null} onOpenChange={(o) => !o && setFresh(null)}>
			<DialogContent className="text-center sm:max-w-sm">
				<DialogHeader className="items-center">
					<div className="mx-auto flex size-16 animate-in items-center justify-center rounded-full bg-primary text-primary-foreground zoom-in-50 duration-500 motion-reduce:animate-none">
						<Award className="size-8" />
					</div>
					<DialogTitle className="pt-2">{title}</DialogTitle>
					<DialogDescription>
						{fresh ? `${labels[fresh] ?? fresh} — ${lead}` : lead}
					</DialogDescription>
				</DialogHeader>
				<DialogFooter className="sm:justify-center">
					<Button onClick={() => setFresh(null)}>{close}</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
