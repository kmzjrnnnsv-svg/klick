"use client";

import type * as React from "react";
import { ensureEvidenceStepUp } from "@/app/actions/evidence";
import { ExportLink } from "@/components/entity/export-link";

// Download einer Nachweis-Datei aus Listen (Prüfpfad, Anfragen, Control):
// vertrauliche und streng geheime erst nach Bestätigung im Dialog (Step-up),
// sonst direkt. Ohne diesen Schritt landete der Klick auf einer leeren
// 403-Seite; der Server prüft weiter selbst (/api/nachweise/[id]).
export function EvidenceFileLink({
	id,
	classification,
	className,
	children,
}: {
	id: string;
	classification: string;
	className?: string;
	children: React.ReactNode;
}) {
	const href = `/api/nachweise/${id}`;
	if (classification === "confidential" || classification === "secret")
		return (
			<ExportLink
				href={href}
				className={className}
				ensure={ensureEvidenceStepUp}
			>
				{children}
			</ExportLink>
		);
	return (
		<a href={href} className={className}>
			{children}
		</a>
	);
}
