import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getTemplate } from "@/app/actions/templates";
import { auth } from "@/auth";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { TemplateEditor } from "@/components/templates/template-editor";

export default async function EditTemplatePage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const session = await auth();
	if (!session?.user) redirect("/login");
	const { id } = await params;
	const t = await getTranslations("Templates");
	const data = await getTemplate(id);
	if (!data) notFound();

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
					{data.template.name}
				</h1>
				<TemplateEditor
					id={data.template.id}
					initialName={data.template.name}
					initialDescription={data.template.description ?? ""}
					initialIsDefault={data.template.isDefault}
					initialStages={data.stages.map((s) => ({
						kind: s.kind as never,
						name: s.name,
						description: s.description ?? "",
						expectedDays: s.expectedDays,
						responsibleRole: s.responsibleRole as never,
						required: s.required,
						materials: s.materials ?? "",
					}))}
				/>
			</main>
			<Footer />
		</>
	);
}
