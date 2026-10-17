import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { safeNextPath } from "@/lib/auth/magic-link";
import { cn } from "@/lib/utils";

export default async function VerifyPage({
	searchParams,
}: {
	searchParams: Promise<{ weiter?: string | string[] }>;
}) {
	const { weiter } = await searchParams;
	const t = await getTranslations("Auth");
	// Zurück zum Formular — mit demselben Ziel (z. B. die Einladung).
	const next = safeNextPath(Array.isArray(weiter) ? weiter[0] : weiter);
	const back = next ? `/login?weiter=${encodeURIComponent(next)}` : "/login";
	return (
		<div className="flex flex-col gap-4">
			<p className="lv-eyebrow text-[0.6rem] text-brown">Klick</p>
			<h1 className="font-serif-display text-3xl text-primary">
				{t("verifyTitle")}
			</h1>
			<p className="text-muted-foreground">{t("verifyLead")}</p>
			<p className="text-muted-foreground text-sm">{t("verifyHint")}</p>
			<Link
				href={back}
				className={cn(buttonVariants({ variant: "outline" }), "w-fit")}
			>
				{t("verifyBack")}
			</Link>
		</div>
	);
}
