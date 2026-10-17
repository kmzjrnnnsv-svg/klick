import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button, buttonVariants } from "@/components/ui/button";
import { verifyFormFields } from "@/lib/auth/magic-link";

// Ziel des Links aus der Anmelde-Mail. Erst der Klick auf „Jetzt anmelden“
// löst den Einmal-Token ein (GET-Formular an den Better-Auth-Endpunkt, läuft
// auch ohne JavaScript). Link-Scanner, die URLs aus Mails vorab aufrufen,
// sehen nur diese Seite und verbrauchen den Token nicht.
export default async function MagicLinkConfirmPage({
	searchParams,
}: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const t = await getTranslations("Auth");
	const fields = verifyFormFields(await searchParams);
	return (
		<div className="flex flex-col gap-6">
			<div>
				<p className="lv-eyebrow text-[0.6rem] text-brown">Klick</p>
				<h1 className="mt-2 font-serif-display text-3xl text-primary">
					{t("linkTitle")}
				</h1>
				<p className="mt-2 text-muted-foreground text-sm">
					{fields ? t("linkLead") : t("linkBroken")}
				</p>
			</div>
			{fields ? (
				<form
					method="get"
					action="/api/auth/magic-link/verify"
					className="flex flex-col"
				>
					{fields.map(([name, value]) => (
						<input key={name} type="hidden" name={name} value={value} />
					))}
					<Button type="submit" variant="brown">
						{t("linkConfirm")}
					</Button>
				</form>
			) : (
				<Link href="/login" className={buttonVariants({ variant: "brown" })}>
					{t("linkNew")}
				</Link>
			)}
		</div>
	);
}
