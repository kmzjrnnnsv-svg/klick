"use client";

import { CircleHelp } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { helpTarget } from "@/lib/help/routes";

// „Hilfe zu dieser Seite“ oben rechts: öffnet den Artikel zur aktuellen Seite
// (Zuordnung in lib/help/routes.ts), im Wiki selbst das Inhaltsverzeichnis.
// `allowed` = Artikel, die die Person sehen darf (Mitarbeitende); ein anderer
// Artikel führt dann auf „Erste Schritte“ statt auf eine leere Seite.
export function HelpLink({
	allowed,
	auditor = false,
}: {
	allowed?: readonly string[];
	// Prüfer:innen: Audit-Seiten führen auf „Prüfen mit Klick“
	auditor?: boolean;
}) {
	const t = useTranslations("Help");
	const pathname = usePathname() ?? "/";
	const href = pathname.startsWith("/hilfe")
		? "/hilfe"
		: `/hilfe/${helpTarget(pathname, allowed, auditor)}`;
	return (
		<Button variant="ghost" size="icon" asChild>
			<Link href={href} aria-label={t("pageHelp")} title={t("pageHelp")}>
				<CircleHelp aria-hidden="true" />
			</Link>
		</Button>
	);
}
