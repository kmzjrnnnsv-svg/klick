import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";

export default async function NotFound() {
	const t = await getTranslations("Errors");
	const tc = await getTranslations("Common");
	return (
		<main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-6 px-4 py-24 text-center">
			<p className="lv-eyebrow text-[0.62rem] text-muted-foreground">404</p>
			<h1 className="font-serif-display text-4xl text-primary">
				{t("notFoundTitle")}
			</h1>
			<p className="text-muted-foreground">{t("notFoundLead")}</p>
			<Link href="/" className={buttonVariants({ variant: "outline" })}>
				{tc("toHome")}
			</Link>
		</main>
	);
}
