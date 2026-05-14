"use client";

import { Languages } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";

// Betrachter-Sprach-Toggle (LinkedIn-Stil). Steuert ausschliesslich die
// ANGEZEIGTE Profil-Sprache über einen ?lang=-URL-Param — der Profil-
// Besitzer editiert weiterhin nur in seiner Origin-Sprache. Default-
// Anzeige = Origin; ein Klick übersetzt in die Gegensprache.
export function LanguageToggle({
	origin,
	current,
	pending,
	className,
}: {
	// Origin-Sprache des Profils. Caller normalisiert (nie raw null).
	origin: "de" | "en";
	// Aktuell angezeigte Sprache = ?lang ?? origin.
	current: "de" | "en";
	// True, wenn die angefragte Übersetzung noch nicht existiert und im
	// Hintergrund erzeugt wird (Altprofile). Zeigt einen Wartehinweis.
	pending?: boolean;
	className?: string;
}) {
	const t = useTranslations("LanguageToggle");
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const [isPending, startTransition] = useTransition();

	const showingOriginal = current === origin;
	const other: "de" | "en" = current === "de" ? "en" : "de";

	function go() {
		const params = new URLSearchParams(searchParams);
		if (showingOriginal) {
			params.set("lang", other);
		} else {
			// Zurück zum Original → Param entfernen statt origin zu setzen,
			// damit die URL sauber bleibt.
			params.delete("lang");
		}
		const qs = params.toString();
		startTransition(() => {
			router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
		});
	}

	return (
		<div className={className}>
			<button
				type="button"
				onClick={go}
				disabled={isPending}
				className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 font-mono text-[11px] text-muted-foreground uppercase tracking-wider transition-colors hover:text-foreground disabled:opacity-60"
			>
				<Languages className="h-3 w-3 shrink-0" strokeWidth={1.5} />
				{showingOriginal
					? t("seeTranslation", { lang: other.toUpperCase() })
					: t("showOriginal")}
			</button>
			{!showingOriginal && (
				<span className="ml-2 text-muted-foreground text-[11px]">
					{pending ? t("translatingHint") : t("autoTranslatedHint")}
				</span>
			)}
		</div>
	);
}
