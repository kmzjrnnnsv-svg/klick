"use client";

import { CircleHelp } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { helpSlugForPath } from "@/lib/help/routes";

// „Hilfe zu dieser Seite“ oben rechts: öffnet den Artikel zur aktuellen Seite
// (Zuordnung in lib/help/routes.ts), im Wiki selbst das Inhaltsverzeichnis.
export function HelpLink() {
	const t = useTranslations("Help");
	const pathname = usePathname() ?? "/";
	const href = pathname.startsWith("/hilfe")
		? "/hilfe"
		: `/hilfe/${helpSlugForPath(pathname)}`;
	return (
		<Button variant="ghost" size="icon" asChild>
			<Link href={href} aria-label={t("pageHelp")} title={t("pageHelp")}>
				<CircleHelp aria-hidden="true" />
			</Link>
		</Button>
	);
}
