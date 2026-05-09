import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { TemplateEditor } from "@/components/templates/template-editor";

export default async function NewTemplatePage() {
	const session = await auth();
	if (!session?.user) redirect("/login");
	const t = await getTranslations("Templates");

	return (
		<>
			<Header />
			<main className="mx-auto w-full max-w-3xl flex-1 px-3 pt-6 pb-20 sm:px-6 sm:pt-12">
				<Link
					href="/templates"
					className="lv-eyebrow text-[0.55rem] text-muted-foreground hover:text-foreground"
				>
					← {t("back")}
				</Link>
				<h1 className="mt-3 mb-6 font-serif-display text-3xl">
					{t("newTitle")}
				</h1>
				<TemplateEditor />
			</main>
			<Footer />
		</>
	);
}
