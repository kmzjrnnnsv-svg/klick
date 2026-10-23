import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { fmtDateTime } from "@/lib/wallet/display";

// Banner im ganzen Wallet-Bereich, wenn der eigene Signer eingefroren oder
// nicht erreichbar ist — Auszahlungen stehen dann still.
export async function SignerBanner({
	state,
	reason,
	since,
}: {
	state: "frozen" | "unreachable";
	reason?: string | null;
	since?: Date | null;
}) {
	const t = await getTranslations("Wallet");
	return (
		<div
			role="alert"
			className="mb-6 flex flex-col gap-1 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4"
		>
			<p className="flex items-start gap-2">
				<ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
				<span>
					<span className="font-medium">
						{state === "frozen" ? t("bannerFrozen") : t("bannerUnreachable")}
					</span>{" "}
					{state === "frozen" && reason && t("bannerReason", { reason })}
					{state === "unreachable" &&
						since &&
						t("bannerSince", { at: fmtDateTime.format(since) })}
				</span>
			</p>
			<Link
				href="/wallet/sicherheit"
				className="whitespace-nowrap text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				{t("bannerLink")}
			</Link>
		</div>
	);
}
