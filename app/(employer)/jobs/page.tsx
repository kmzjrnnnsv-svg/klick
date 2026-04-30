import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";

export default async function JobsPage() {
	const session = await auth();
	if (!session?.user) redirect("/login");

	const t = await getTranslations("Jobs");
	return (
		<>
			<Header />
			<main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-14 pb-24 sm:px-6 sm:pt-20">
				<h1 className="font-semibold text-2xl tracking-tight sm:text-3xl">
					{t("title")}
				</h1>
				<div className="mt-12 rounded-lg border border-border border-dashed p-10 text-center sm:p-16">
					<p className="text-muted-foreground text-sm">{t("empty")}</p>
				</div>
			</main>
			<Footer />
		</>
	);
}
