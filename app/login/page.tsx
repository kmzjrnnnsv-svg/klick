import { getTranslations } from "next-intl/server";
import { signIn } from "@/auth";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

async function loginAction(formData: FormData) {
	"use server";
	const email = String(formData.get("email") ?? "").trim();
	if (!email) return;
	await signIn("email", { email, redirectTo: "/post-login" });
}

const DEMO_ROLES = [
	{
		key: "candidate",
		labelKey: "demoRoles.candidate",
		emailKey: "demoEmails.candidate",
		descKey: "demoDescriptions.candidate",
	},
	{
		key: "company",
		labelKey: "demoRoles.company",
		emailKey: "demoEmails.company",
		descKey: "demoDescriptions.company",
	},
	{
		key: "headhunter",
		labelKey: "demoRoles.headhunter",
		emailKey: "demoEmails.headhunter",
		descKey: "demoDescriptions.headhunter",
	},
	{
		key: "admin",
		labelKey: "demoRoles.admin",
		emailKey: "demoEmails.admin",
		descKey: "demoDescriptions.admin",
	},
] as const;

export default async function LoginPage() {
	const t = await getTranslations("Login");
	const demoEnabled = process.env.ENABLE_DEMO_LOGIN === "true";
	return (
		<>
			<Header />
			<main className="mx-auto w-full max-w-sm flex-1 px-4 pt-20 pb-24 sm:pt-28">
				<p className="lv-eyebrow text-center text-[0.6rem] text-muted-foreground">
					Maison Klick
				</p>
				<h1 className="mt-4 text-center font-serif-display text-3xl sm:text-4xl">
					{t("title")}
				</h1>
				<p className="mx-auto mt-4 max-w-xs text-center text-muted-foreground text-sm leading-relaxed">
					{t("subtitle")}
				</p>
				<form action={loginAction} className="mt-10 space-y-5">
					<Input
						type="email"
						name="email"
						required
						autoFocus
						autoComplete="email"
						placeholder={t("emailPlaceholder")}
						aria-label={t("emailLabel")}
					/>
					<Button type="submit" className="w-full">
						{t("submit")}
					</Button>
				</form>
				<p className="mt-8 text-center text-muted-foreground text-xs leading-relaxed">
					{t("note")}
				</p>

				{demoEnabled && (
					<div className="mt-12 border-t border-border pt-8">
						<p className="lv-eyebrow text-[0.6rem] text-foreground">
							{t("demoTitle")}
						</p>
						<p className="mt-2 text-muted-foreground text-xs leading-relaxed">
							{t("demoSubtitle")}
						</p>
						<ul className="mt-6 space-y-0">
							{DEMO_ROLES.map((r) => (
								<li
									key={r.key}
									className="border-border/60 border-b last:border-b-0"
								>
									<a
										href={`/api/demo-login?role=${r.key}`}
										className="block py-4 transition hover:opacity-70"
									>
										<div className="flex items-center justify-between gap-3">
											<span className="lv-eyebrow text-[0.65rem] text-foreground">
												{t(r.labelKey)}
											</span>
											<span className="font-mono text-[10px] text-muted-foreground">
												{t(r.emailKey)}
											</span>
										</div>
										<p className="mt-1.5 text-muted-foreground text-xs leading-snug">
											{t(r.descKey)}
										</p>
									</a>
								</li>
							))}
						</ul>
					</div>
				)}
			</main>
			<Footer />
		</>
	);
}
