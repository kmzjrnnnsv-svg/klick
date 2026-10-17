"use client";

import { type ComponentProps, useState } from "react";
import { Tabs } from "@/components/ui/tabs";

// Client-Reiter, die ?tab=… lesen und schreiben: Ein Link auf ?tab=x wählt den
// Reiter (auch auf derselben Seite), ein Klick ersetzt den Parameter in der
// URL, ohne die Seite neu zu laden — teilbar und mit Zurück-Taste.
export function UrlSyncedTabs({
	value,
	param = "tab",
	...props
}: Omit<
	ComponentProps<typeof Tabs>,
	"value" | "defaultValue" | "onValueChange"
> & { value: string; param?: string }) {
	const [current, setCurrent] = useState(value);
	const [fromServer, setFromServer] = useState(value);
	if (value !== fromServer) {
		setFromServer(value);
		setCurrent(value);
	}
	return (
		<Tabs
			{...props}
			value={current}
			onValueChange={(v) => {
				setCurrent(v);
				const url = new URL(window.location.href);
				url.searchParams.set(param, v);
				window.history.replaceState(window.history.state, "", url);
			}}
		/>
	);
}
