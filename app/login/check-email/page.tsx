import { getTranslations } from "next-intl/server";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";

export default async function CheckEmailPage() {
	const t = await getTranslations("LoginCheck");
	return (
		<>
			<Header />
			<main className="mx-auto w-full max-w-sm flex-1 px-4 pt-16 pb-24 sm:pt-24">
				<h1 className="font-semibold text-2xl tracking-tight sm:text-3xl">
					{t("title")}
				</h1>
				<p className="mt-3 text-muted-foreground text-sm leading-relaxed">
					{t("body")}
				</p>
			</main>
			<Footer />
		</>
	);
}
