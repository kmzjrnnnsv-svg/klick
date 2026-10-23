import { ShieldAlert } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { SignerState } from "@/lib/wallet/signer/status";

// Hinweis, wenn Senden gerade nicht geht (kein Signer, nicht erreichbar,
// andere Org, eingefroren). Bereit → nichts; „eingefroren“ und „nicht
// erreichbar“ beim eigenen Signer zeigt schon das Banner im Layout.
export async function SignerNotice({
	state,
	own = false,
}: {
	state: SignerState;
	own?: boolean;
}) {
	if (state === "ready") return null;
	if (own && (state === "frozen" || state === "unreachable")) return null;
	const t = await getTranslations("Wallet");
	const danger = state === "frozen" || state === "unreachable";
	return (
		<p
			role="status"
			className={`mb-6 flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${danger ? "border-destructive/40 bg-destructive/5" : "border-border bg-muted/40"}`}
		>
			<ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
			<span>{t(`signerState_${state}`)}</span>
		</p>
	);
}
