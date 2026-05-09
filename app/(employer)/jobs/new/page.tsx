import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getEmployer } from "@/app/actions/jobs";
import { listTemplates } from "@/app/actions/templates";
import { auth } from "@/auth";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { JobForm } from "@/components/jobs/job-form";

export default async function NewJobPage() {
	const session = await auth();
	if (!session?.user?.id) redirect("/login");

	const employer = await getEmployer();
	if (!employer) redirect("/jobs");

	const t = await getTranslations("Jobs");
	let templates: Awaited<ReturnType<typeof listTemplates>> = [];
	try {
		templates = await listTemplates();
	} catch (e) {
		console.warn("[jobs/new] templates", e);
	}
	return (
		<>
			<Header />
			<main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-12 pb-24 sm:px-6 sm:pt-16">
				<header className="mb-8">
					<h1 className="font-semibold text-2xl tracking-tight sm:text-3xl">
						{t("newJob")}
					</h1>
					<p className="mt-1 text-muted-foreground text-sm leading-relaxed">
						{t("editorHint")}
					</p>
				</header>
				<JobForm
					initial={null}
					templates={templates.map((tt) => ({
						id: tt.template.id,
						name: tt.template.name,
						isDefault: tt.template.isDefault,
					}))}
				/>
			</main>
			<Footer />
		</>
	);
}
