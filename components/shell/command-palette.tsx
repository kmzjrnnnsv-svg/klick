"use client";

import { Search } from "lucide-react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { NavGroup } from "@/lib/nav";

// Die Palette (cmdk) lädt erst beim ersten Öffnen, nicht mit jeder Seite.
const CommandPaletteDialog = dynamic(
	() => import("./command-palette-dialog").then((m) => m.CommandPaletteDialog),
	{ ssr: false },
);

// Andere Knöpfe (Suchfeld in der Seitenleiste) öffnen die Palette über
// dieses Ereignis; die Palette selbst bleibt einmal im Kopf gemountet.
export const OPEN_PALETTE_EVENT = "klick:open-palette";

// ⌘K: Navigation + Volltextsuche (/suche?q=…).
// tabBar: unter 1024 px steht die Suche in der Tab-Leiste, ab 1024 px als
// Suchfeld oben in der Seitenleiste — dann kein Knopf im Kopf (sonst läuft
// die Kopfleiste bei großer Schrift über)
export function CommandPalette({
	groups,
	tabBar = false,
}: {
	groups: NavGroup[];
	tabBar?: boolean;
}) {
	const t = useTranslations("Nav");
	const [open, setOpen] = useState(false);
	const [everOpened, setEverOpened] = useState(false);
	useEffect(() => {
		if (open) setEverOpened(true);
	}, [open]);

	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
				e.preventDefault();
				setOpen((v) => !v);
			}
		}
		const onOpen = () => setOpen(true);
		document.addEventListener("keydown", onKey);
		window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
		return () => {
			document.removeEventListener("keydown", onKey);
			window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
		};
	}, []);

	return (
		<>
			<Button
				variant="outline"
				size="sm"
				onClick={() => setOpen(true)}
				className={
					tabBar
						? "hidden"
						: "hidden font-normal text-muted-foreground md:inline-flex"
				}
				aria-label={t("searchHint")}
			>
				<Search />
				<span>{t("searchHint")}</span>
			</Button>
			<Button
				variant="ghost"
				size="icon"
				onClick={() => setOpen(true)}
				className={tabBar ? "hidden" : "md:hidden"}
				aria-label={t("searchHint")}
			>
				<Search />
			</Button>
			{(open || everOpened) && (
				<CommandPaletteDialog
					groups={groups}
					open={open}
					onOpenChange={setOpen}
				/>
			)}
		</>
	);
}
