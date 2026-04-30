import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { getIncomingInterest } from "@/app/actions/interests";
import { auth } from "@/auth";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { DecisionButtons } from "@/components/interests/decision-buttons";

export default async function RequestDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const session = await auth();
	if (!session?.user) redirect("/login");

	const { id } = await params;
	const item = await getIncomingInterest(id);
	if (!item) notFound();

	const t = await getTranslations("Requests");
	const fmt = await getFormatter();
	const { interest, job, companyName } = item;

	return (
		<>
			<Header />
			<main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-12 pb-24 sm:px-6 sm:pt-16">
				<header className="mb-8">
					<Link
						href="/requests"
						className="text-muted-foreground text-xs hover:text-foreground"
					>
						← {t("title")}
					</Link>
					<h1 className="mt-1 font-semibold text-2xl tracking-tight sm:text-3xl">
						{job.title}
					</h1>
					<p className="mt-1 text-muted-foreground text-sm">{companyName}</p>
				</header>

				<section className="space-y-4">
					<div className="rounded-lg border border-border bg-background p-4 sm:p-5">
						<h2 className="font-medium text-sm">{t("whatTheyAsked")}</h2>
						<p className="mt-2 text-muted-foreground text-xs leading-relaxed">
							{t(`depthExplain.${interest.verifyDepth}`)}
						</p>
					</div>

					{interest.message && (
						<div className="rounded-lg border border-border bg-background p-4 sm:p-5">
							<h2 className="font-medium text-sm">
								{t("messageFrom", { company: companyName })}
							</h2>
							<p className="mt-2 whitespace-pre-wrap text-foreground/90 text-sm leading-relaxed">
								{interest.message}
							</p>
						</div>
					)}

					<div className="rounded-lg border border-border bg-background p-4 sm:p-5">
						<h2 className="font-medium text-sm">{t("aboutTheJob")}</h2>
						<p className="mt-2 line-clamp-6 whitespace-pre-wrap text-foreground/90 text-sm leading-relaxed">
							{job.description}
						</p>
					</div>

					<div className="rounded-lg border border-border bg-background p-4 text-muted-foreground text-xs sm:p-5">
						{t("receivedAt", {
							time: fmt.dateTime(interest.createdAt, {
								dateStyle: "long",
								timeStyle: "short",
							}),
						})}
						{interest.expiresAt && (
							<>
								{" · "}
								{t("expiresAt", {
									time: fmt.dateTime(interest.expiresAt, {
										dateStyle: "long",
									}),
								})}
							</>
						)}
					</div>

					{interest.status === "pending" ? (
						<DecisionButtons interestId={interest.id} />
					) : (
						<div className="rounded-lg border border-border bg-muted/30 p-4 text-sm sm:p-5">
							<div className="font-medium">
								{t(`status.${interest.status}`)}
							</div>
							{interest.decidedAt && (
								<div className="mt-1 text-muted-foreground text-xs">
									{t("decidedAt", {
										time: fmt.dateTime(interest.decidedAt, {
											dateStyle: "medium",
											timeStyle: "short",
										}),
									})}
								</div>
							)}
						</div>
					)}
				</section>
			</main>
			<Footer />
		</>
	);
}
