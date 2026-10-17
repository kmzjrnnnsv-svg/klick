"use client";

import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

// Rückmeldungen der Upload-Pipeline (lib/evidence/store.ts) als Klartext mit
// nächstem Schritt — für Nachweis-Dialog, Gap-Analyse und Portal gleich.

type Failed = {
	ok: false;
	error: string;
	fieldErrors?: Record<string, string[]>;
};

const KNOWN = new Set([
	"upload_too_large",
	"upload_empty",
	"upload_type_not_allowed",
	"upload_signature_mismatch",
	"upload_invalid_text",
	"upload_malware",
	"upload_scan_unavailable",
	"rate_limited",
]);

export function useUploadFeedback() {
	const t = useTranslations("Dlp");
	const tc = useTranslations("Common");

	function detectors(reasons: readonly string[]): string {
		const labels = [...new Set(reasons)].map((r) =>
			t(`detector_${r}` as "detector_iban"),
		);
		return new Intl.ListFormat("de", { type: "conjunction" }).format(labels);
	}

	function errorText(res: Failed): string {
		if (res.error === "upload_dlp_blocked")
			return t("blocked", { detectors: detectors(res.fieldErrors?.dlp ?? []) });
		if (KNOWN.has(res.error)) return t(res.error as "upload_empty");
		return tc("error");
	}

	// Warnung, die erst nach Bestätigung hochlädt (Regel „warn“).
	function dlpWarning(res: Failed): string[] | null {
		return res.error === "upload_dlp_warn"
			? (res.fieldErrors?.dlp ?? [])
			: null;
	}

	return { errorText, dlpWarning, detectors };
}

export function DlpWarning({
	reasons,
	acknowledged,
	onAcknowledge,
	id = "dlp-ack",
}: {
	reasons: readonly string[];
	acknowledged: boolean;
	onAcknowledge: (v: boolean) => void;
	id?: string;
}) {
	const t = useTranslations("Dlp");
	const { detectors } = useUploadFeedback();
	return (
		<div
			role="alert"
			className="flex flex-col gap-2 rounded-md border border-amber-500/50 bg-amber-500/5 p-3 text-sm"
		>
			<p className="font-medium">{t("warnTitle")}</p>
			<p className="text-muted-foreground">
				{t("warnLead", { detectors: detectors(reasons) })}
			</p>
			<div className="flex items-start gap-2">
				<Checkbox
					id={id}
					checked={acknowledged}
					onCheckedChange={(v) => onAcknowledge(v === true)}
				/>
				<Label htmlFor={id} className="font-normal">
					{t("acknowledge")}
				</Label>
			</div>
		</div>
	);
}
