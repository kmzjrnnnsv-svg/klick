import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getReferenceByToken, submitReference } from "@/app/actions/references";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";

export default async function ReferenceSubmitPage({
	params,
}: {
	params: Promise<{ token: string }>;
}) {
	const { token } = await params;
	const t = await getTranslations("Reference");
	const ref = await getReferenceByToken(token);
	if (!ref) notFound();

	const questions = ref.questions;
	async function submit(formData: FormData) {
		"use server";
		const answers = questions.map((q, i) => ({
			question: q,
			answer: formData.get(`answer-${i}`)?.toString().trim() ?? "",
		}));
		await submitReference({ token, answers });
	}

	return (
		<>
			<Header />
			<main className="mx-auto w-full max-w-2xl flex-1 px-3 pt-6 pb-20 sm:px-6 sm:pt-12">
				<header className="mb-6 border-border border-b pb-6">
					<p className="lv-eyebrow text-[0.6rem] text-primary">
						{t("eyebrow")}
					</p>
					<h1 className="mt-2 font-serif-display text-3xl sm:text-4xl">
						{t("title", { name: ref.refereeName })}
					</h1>
					<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
						{t("hint")}
					</p>
				</header>

				{ref.status === "expired" && (
					<div className="rounded-sm border border-zinc-500/30 bg-zinc-500/5 p-5 text-sm">
						{t("expired")}
					</div>
				)}

				{ref.status === "submitted" && (
					<div className="rounded-sm border border-emerald-500/30 bg-emerald-500/5 p-5 text-emerald-700 text-sm dark:text-emerald-300">
						{t("alreadySubmitted")}
					</div>
				)}

				{ref.status === "pending" && (
					<form action={submit} className="space-y-6">
						{ref.questions.map((q, i) => (
							<label key={q} className="block space-y-2">
								<span className="font-serif-display text-base">{q}</span>
								<textarea
									name={`answer-${i}`}
									rows={4}
									required
									className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm focus-visible:border-foreground focus-visible:outline-none"
								/>
							</label>
						))}
						<div className="flex justify-end">
							<Button type="submit">{t("submit")}</Button>
						</div>
					</form>
				)}
			</main>
			<Footer />
		</>
	);
}
