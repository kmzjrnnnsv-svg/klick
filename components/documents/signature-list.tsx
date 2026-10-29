import { CheckCircle2, XCircle } from "lucide-react";
import { getTranslations } from "next-intl/server";

// Unterschriften unter einer Dokument-Fassung (Dokumentenlenkung): wer, in
// welcher Funktion, wann; das Zeichen zeigt die Prüfung (Text passt zur
// Fassung und ihrer Prüfsumme, Assertion mit dem gespeicherten Schlüssel
// gültig). Server-Komponente, die Prüfung rechnet die Seite.
export type SignatureLine = {
	id: string;
	signerName: string;
	functionLabel: string | null;
	signedAt: Date;
	valid: boolean;
};

const fmt = new Intl.DateTimeFormat("de-DE", {
	dateStyle: "medium",
	timeStyle: "short",
	timeZone: "Europe/Berlin",
});

export async function SignatureList({ lines }: { lines: SignatureLine[] }) {
	if (lines.length === 0) return null;
	const t = await getTranslations("Documents");
	return (
		<ul className="flex flex-col gap-0.5 text-footnote">
			{lines.map((l) => (
				<li key={l.id} className="flex items-center gap-1.5">
					{l.valid ? (
						<CheckCircle2
							className="size-3.5 shrink-0 text-success"
							aria-label={t("signatureValid")}
						/>
					) : (
						<XCircle
							className="size-3.5 shrink-0 text-destructive"
							aria-label={t("signatureInvalid")}
						/>
					)}
					<span>
						{t("signedBy", {
							name: l.signerName,
							date: fmt.format(l.signedAt),
						})}
						{l.functionLabel ? ` (${l.functionLabel})` : ""}
					</span>
				</li>
			))}
		</ul>
	);
}
