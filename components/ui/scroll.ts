// Scrollbereich der App: ab 1024 px die rechte Spalte (data-scroll-root),
// darunter das Fenster. Nur im Browser aufrufen.

export function scrollRoot(): HTMLElement | null {
	const el = document.querySelector<HTMLElement>("[data-scroll-root]");
	if (!el) return null;
	// scrollt die Spalte selbst? Sonst (unter 1024 px) scrollt das Fenster
	return getComputedStyle(el).overflowY === "auto" ? el : null;
}

/** Nach oben, egal ob Spalte oder Fenster scrollt */
export function scrollAppToTop(behavior: ScrollBehavior = "auto"): void {
	const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	const b = reduce ? "auto" : behavior;
	const root = scrollRoot();
	if (root) root.scrollTo({ top: 0, behavior: b });
	else window.scrollTo({ top: 0, behavior: b });
	// geteilte Ansicht: die Hauptspalte scrollt für sich (data-split-main)
	for (const pane of splitPanes(true)) pane.scrollTo({ top: 0, behavior: b });
}

/** Spalten der geteilten Ansicht, die gerade selbst scrollen */
export function splitPanes(mainOnly = false): HTMLElement[] {
	return [
		...document.querySelectorAll<HTMLElement>(
			mainOnly ? "[data-split-main]" : "[data-split-pane]",
		),
	].filter((el) => getComputedStyle(el).overflowY === "auto");
}
