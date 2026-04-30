import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";

export default async function EmployerOnboardingLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const session = await auth();
	if (!session?.user) redirect("/login");
	const role = (session.user as { role?: string }).role;
	if (role !== "employer") redirect("/post-login");

	const t = await getTranslations("Onboarding");

	return (
		<div className="flex min-h-svh flex-col bg-background">
			<header className="sticky top-0 z-10 border-border/60 border-b bg-background/80 px-4 py-3 backdrop-blur sm:px-6">
				<div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-4">
					<Link href="/" className="font-semibold text-base tracking-tight">
						Klick
					</Link>
					<Link
						href="/jobs"
						className="text-muted-foreground text-xs hover:text-foreground"
					>
						{t("layout.skipForNow")}
					</Link>
				</div>
			</header>
			<main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pt-10 pb-16 sm:px-6 sm:pt-14">
				{children}
			</main>
		</div>
	);
}
