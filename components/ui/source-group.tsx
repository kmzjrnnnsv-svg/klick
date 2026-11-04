"use client";

import { ChevronDown } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { SOURCE_HEAD, SourceItems } from "./source-list";

// Einklappbare Gruppe einer Seitenleiste (Menü beider Apps): <details>, der
// Zustand steht im Browser (storageKey), damit er auch nach dem Neuladen gilt;
// die Gruppe mit der offenen Seite bleibt immer auf. Ohne Speicher (privates
// Fenster) gilt der Zustand bis zum Neuladen.

function readClosed(key: string): Set<string> {
	try {
		const raw = window.localStorage.getItem(key);
		return new Set(raw ? (JSON.parse(raw) as string[]) : []);
	} catch {
		return new Set();
	}
}

function writeClosed(key: string, closed: Set<string>) {
	try {
		window.localStorage.setItem(key, JSON.stringify([...closed]));
	} catch {
		// gesperrter Speicher: nur bis zum Neuladen
	}
}

export function SourceGroup({
	id,
	title,
	active,
	storageKey,
	children,
}: {
	id: string;
	title: string;
	// enthält die offene Seite
	active: boolean;
	storageKey: string;
	children: ReactNode;
}) {
	const ref = useRef<HTMLDetailsElement>(null);
	useEffect(() => {
		const el = ref.current;
		if (el) el.open = active || !readClosed(storageKey).has(id);
	}, [active, id, storageKey]);
	function remember(e: React.SyntheticEvent<HTMLDetailsElement>) {
		const closed = readClosed(storageKey);
		if (e.currentTarget.open) closed.delete(id);
		else closed.add(id);
		writeClosed(storageKey, closed);
	}
	return (
		<details
			ref={ref}
			open
			data-group={id}
			onToggle={remember}
			className="group/nav"
		>
			<summary
				className={cn(
					SOURCE_HEAD,
					"cursor-default list-none justify-between rounded-md hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden",
				)}
			>
				{title}
				<ChevronDown
					aria-hidden="true"
					className="size-3.5 -rotate-90 transition-transform group-open/nav:rotate-0 motion-reduce:transition-none"
				/>
			</summary>
			<SourceItems>{children}</SourceItems>
		</details>
	);
}
