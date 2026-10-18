"use client";

import { useTranslations } from "next-intl";
import type * as React from "react";
import { useState } from "react";
import { toast } from "sonner";
import { ensureExportStepUp } from "@/app/actions/security";
import { withStepUp } from "@/components/auth/step-up-dialog";

// Download einer Export-Route mit Step-up-Pflicht (ZIP-Pakete): erst den
// Step-up im Dialog bestätigen, dann lädt der Browser die Datei — die Seite
// bleibt stehen. Ohne Skript oder per Mittelklick greift weiter der normale
// Link (Server leitet bei Bedarf auf /login/2fa?stepup=1 um).
export function ExportLink({
	href,
	className,
	title,
	children,
}: {
	href: string;
	className?: string;
	title?: string;
	children: React.ReactNode;
}) {
	const tc = useTranslations("Common");
	const [busy, setBusy] = useState(false);
	return (
		<a
			href={href}
			className={className}
			title={title}
			aria-busy={busy || undefined}
			onClick={async (e) => {
				if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
				e.preventDefault();
				if (busy) return;
				setBusy(true);
				try {
					const res = await withStepUp(() => ensureExportStepUp());
					if (res.ok) window.location.assign(href);
					else if (res.error !== "step_up_required") toast.error(tc("error"));
				} finally {
					setBusy(false);
				}
			}}
		>
			{children}
		</a>
	);
}
