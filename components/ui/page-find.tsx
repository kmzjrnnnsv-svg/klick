"use client";

import { useEffect } from "react";
import { isApplePlatform, isFindShortcut } from "./keyboard";

// ⌘F (Mac) bzw. Strg+F springt ins Suchfeld der Seite — wie in Mail oder
// den Einstellungen am Mac. Ein Suchfeld meldet sich mit data-page-search
// (ListSearch, RegisterFilters, Hilfe, Suche). Ohne Suchfeld, beim zweiten
// Drücken, in einem anderen Eingabefeld oder bei offenem Dialog bleibt die
// Suche des Browsers. Einmal im Rahmen der App gemountet.

const visible = (el: HTMLElement) => el.getClientRects().length > 0;

function editable(el: Element | null): boolean {
	if (!(el instanceof HTMLElement)) return false;
	if (el.isContentEditable) return true;
	if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)
		return true;
	if (!(el instanceof HTMLInputElement)) return false;
	return !["button", "checkbox", "radio", "submit", "reset", "range"].includes(
		el.type,
	);
}

export function PageFind() {
	useEffect(() => {
		const platform =
			(navigator as Navigator & { userAgentData?: { platform?: string } })
				.userAgentData?.platform ||
			navigator.platform ||
			navigator.userAgent;
		const mac = isApplePlatform(platform);
		const onKey = (e: KeyboardEvent) => {
			if (!isFindShortcut(e, mac)) return;
			if (document.querySelector('[role="dialog"], [role="alertdialog"]'))
				return;
			const field = [
				...document.querySelectorAll<HTMLInputElement>("[data-page-search]"),
			].find(visible);
			if (!field) return;
			const active = document.activeElement;
			if (active === field || editable(active)) return;
			e.preventDefault();
			field.focus();
			field.select();
			field.scrollIntoView({ block: "nearest" });
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);
	return null;
}
