"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

// Dialog, der sich über einen Parameter in der Adresse öffnen lässt
// (`?bearbeiten=1`): Links aus Checklisten führen so direkt ins Formular.
// Beim Schließen verschwindet der Parameter wieder, damit Neuladen und
// Zurück den Dialog nicht erneut öffnen.
export function useParamOpen(param: string | undefined) {
	const search = useSearchParams();
	const pathname = usePathname();
	const router = useRouter();
	const fromUrl = Boolean(param) && search.get(param ?? "") === "1";
	const [open, setOpenState] = useState(fromUrl);
	// Parameter später gesetzt (Link auf derselben Seite): öffnen
	const [seen, setSeen] = useState(fromUrl);
	if (fromUrl && !seen) {
		setSeen(true);
		setOpenState(true);
	}
	if (!fromUrl && seen) setSeen(false);
	const setOpen = (next: boolean) => {
		setOpenState(next);
		if (!next && param && search.get(param) !== null) {
			const q = new URLSearchParams(search.toString());
			q.delete(param);
			const s = q.toString();
			router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
		}
	};
	return [open, setOpen] as const;
}
