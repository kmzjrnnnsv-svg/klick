"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { scrollRoot } from "@/components/ui/scroll";

// Ab 1024 px scrollt nicht das Fenster, sondern die rechte Spalte
// (data-scroll-root). Next setzt dort beim Seitenwechsel nicht zurück:
// neue Seite = oben, außer der Link zeigt auf einen Anker. Filter auf
// derselben Seite (nur die Suche ändert sich) behalten die Position.
export function ScrollReset() {
	const pathname = usePathname();
	const prev = useRef(pathname);
	useEffect(() => {
		if (prev.current === pathname) return;
		prev.current = pathname;
		if (window.location.hash) return;
		scrollRoot()?.scrollTo({ top: 0 });
	}, [pathname]);
	return null;
}
