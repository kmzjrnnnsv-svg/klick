"use client";

import { type ReactNode, useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

// Immer nur ein Modal (Apple HIG): Jeder offene Dialog stellt einen Platz
// bereit (DialogContent, AlertDialogContent). Eine Rückfrage, die während
// des Dialogs nötig wird (Step-up), erscheint dort über dem Inhalt statt
// als zweites Modal darüber. Escape schließt zuerst die Rückfrage.

let hosts: readonly HTMLElement[] = [];
const EMPTY: readonly HTMLElement[] = [];
const listeners = new Set<() => void>();
let escape: (() => void) | null = null;

function emit() {
	for (const l of listeners) l();
}

function subscribe(l: () => void) {
	listeners.add(l);
	return () => {
		listeners.delete(l);
	};
}

// Callback-Ref für den Platz im Dialog (React 19: Rückgabe = Aufräumen)
export function registerModalHost(el: HTMLElement | null) {
	if (!el) return;
	hosts = [...hosts, el];
	emit();
	return () => {
		hosts = hosts.filter((h) => h !== el);
		emit();
	};
}

// zuletzt geöffneter Dialog (oben im Stapel), sonst null
export function topModalHost(): HTMLElement | null {
	return hosts.at(-1) ?? null;
}

export function useModalHosts(): readonly HTMLElement[] {
	return useSyncExternalStore(
		subscribe,
		() => hosts,
		() => EMPTY,
	);
}

// Escape im Dialog: erst die Rückfrage schließen, nicht den Dialog
export function takeHostEscape(): boolean {
	if (!escape) return false;
	escape();
	return true;
}

export function HostPanel({
	host,
	onCancel,
	labelledBy,
	children,
}: {
	host: HTMLElement;
	onCancel: () => void;
	labelledBy: string;
	children: ReactNode;
}) {
	useEffect(() => {
		escape = onCancel;
		return () => {
			if (escape === onCancel) escape = null;
		};
	}, [onCancel]);
	useEffect(() => {
		// nach oben, damit die Rückfrage sichtbar ist; danach Fokus zurück
		host
			.closest<HTMLElement>("[data-slot$='dialog-content']")
			?.scrollTo({ top: 0 });
		const before = document.activeElement as HTMLElement | null;
		return () => before?.focus?.();
	}, [host]);
	return createPortal(
		<section
			aria-labelledby={labelledBy}
			data-step-up=""
			className="absolute inset-0 z-10 flex flex-col gap-4 overflow-y-auto overscroll-contain bg-popover px-5 pt-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6"
		>
			{children}
		</section>,
		host,
	);
}
