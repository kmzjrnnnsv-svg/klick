import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { acceptInvite } from "@/app/actions/agency";
import { auth } from "@/auth";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";

export default async function InviteAcceptPage({
	params,
}: {
	params: Promise<{ token: string }>;
}) {
	const { token } = await params;
	const session = await auth();
	if (!session?.user) {
		redirect(`/login?next=/agency/invites/${token}`);
	}

	const t = await getTranslations("AgencyInvite");

	async function accept() {
		"use server";
		try {
			const { employerId } = await acceptInvite(token);
			redirect(`/jobs?welcome=${employerId}`);
		} catch (e) {
			// Surface as query-error for the page; redirect-eaten errors look bad
			redirect(
				`/agency/invites/${token}?err=${encodeURIComponent(
					e instanceof Error ? e.message : "unknown",
				)}`,
			);
		}
	}

	return (
		<>
			<Header />
			<main className="mx-auto w-full max-w-md flex-1 px-4 pt-16 pb-24 sm:pt-24">
				<p className="lv-eyebrow text-center text-[0.6rem] text-primary">
					{t("eyebrow")}
				</p>
				<h1 className="mt-3 text-center font-serif-display text-3xl">
					{t("title")}
				</h1>
				<p className="mt-3 text-center text-muted-foreground text-sm leading-relaxed">
					{t("hint")}
				</p>
				<form action={accept} className="mt-8">
					<Button type="submit" className="w-full">
						{t("accept")}
					</Button>
				</form>
				<p className="mt-4 text-center text-[10px] text-muted-foreground">
					{t("emailMatchHint")}
				</p>
			</main>
			<Footer />
		</>
	);
}
