"use client";

import { useTranslations } from "next-intl";
import type * as React from "react";
import { useState } from "react";
import { ensureExportStepUp } from "@/app/actions/security";
import { withStepUp } from "@/components/auth/step-up-dialog";
import { errorText, isFourEyesNotice } from "@/components/ui/error-text";
import { toast } from "@/components/ui/toast";
import type { ActionResult } from "@/lib/validation/common";

// Download einer Export-Route mit Step-up-Pflicht (ZIP-Pakete): erst den
// Step-up im Dialog bestätigen, dann lädt der Browser die Datei — die Seite
// bleibt stehen. Ohne Skript oder per Mittelklick greift weiter der normale
// Link (Server leitet bei Bedarf auf /login/2fa?stepup=1 um). `ensure` prüft
// statt des Export-Rechts ein anderes (z. B. vertrauliche Nachweise).
export function ExportLink({
	href,
	className,
	title,
	ensure = ensureExportStepUp,
	children,
}: {
	href: string;
	className?: string;
	title?: string;
	ensure?: () => Promise<ActionResult>;
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
					const res = await withStepUp(() => ensure());
					if (res.ok) window.location.assign(href);
					// Vier-Augen: beantragt bzw. wartet, das ist der nächste Schritt
					else if (isFourEyesNotice(res)) toast.notice(errorText(tc, res));
					else if (res.error !== "step_up_required")
						toast.error(errorText(tc, res));
				} finally {
					setBusy(false);
				}
			}}
		>
			{children}
		</a>
	);
}
