import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { listTemplates } from "@/app/actions/templates";
import { auth } from "@/auth";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function TemplatesPage() {
	const session = await auth();
	if (!session?.user) redirect("/login");

	const t = await getTranslations("Templates");
	let templates: Awaited<ReturnType<typeof listTemplates>> = [];
	try {
		templates = await listTemplates();
	} catch (e) {
		console.warn("[templates] list failed", e);
	}

	return (
		<>
			<Header />
			<main className="mx-auto w-full max-w-3xl flex-1 px-3 pt-6 pb-20 sm:px-6 sm:pt-12">
				<header className="mb-6 flex items-baseline justify-between gap-4">
					<div>
						<p className="lv-eyebrow text-[0.6rem] text-primary">
							{t("eyebrow")}
						</p>
						<h1 className="mt-2 font-serif-display text-3xl sm:text-4xl">
							{t("title")}
						</h1>
						<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
							{t("subtitle")}
						</p>
					</div>
					<Link
						href="/templates/new"
						className={cn(buttonVariants({ size: "sm" }))}
					>
						{t("newTemplate")}
					</Link>
				</header>

				{templates.length === 0 ? (
					<p className="rounded-sm border border-border border-dashed p-8 text-center text-muted-foreground text-sm">
						{t("empty")}
					</p>
				) : (
					<ul className="space-y-3">
						{templates.map(({ template, stages }) => (
							<li
								key={template.id}
								className="rounded-sm border border-border bg-background"
							>
								<Link
									href={`/templates/${template.id}`}
									className="block p-4 transition-colors hover:bg-muted/30 sm:p-5"
								>
									<div className="flex items-start justify-between gap-3">
										<div className="min-w-0">
											<div className="flex items-center gap-2">
												<h2 className="font-serif-display text-lg sm:text-xl">
													{template.name}
												</h2>
												{template.isDefault && (
													<span className="rounded-sm bg-primary/15 px-2 py-0.5 font-mono text-[10px] text-primary uppercase tracking-wide">
														{t("default")}
													</span>
												)}
											</div>
											{template.description && (
												<p className="mt-1 text-muted-foreground text-xs">
													{template.description}
												</p>
											)}
											<p className="mt-2 font-mono text-[10px] text-muted-foreground">
												{t("stagesCount", { n: stages.length })}
											</p>
										</div>
									</div>
									<ol className="mt-3 flex flex-wrap gap-1.5">
										{stages.map((s, i) => (
											<li
												key={s.id}
												className="rounded-sm border border-border bg-background px-2 py-0.5 font-mono text-[10px]"
											>
												{i + 1}. {s.name}
												{s.expectedDays != null && (
													<span className="ml-1 text-muted-foreground">
														· {s.expectedDays}d
													</span>
												)}
											</li>
										))}
									</ol>
								</Link>
							</li>
						))}
					</ul>
				)}
			</main>
			<Footer />
		</>
	);
}
