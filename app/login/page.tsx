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
	{ key: "admin", labelKey: "demoRoles.admin" },
	{ key: "company", labelKey: "demoRoles.company" },
	{ key: "headhunter", labelKey: "demoRoles.headhunter" },
	{ key: "candidate", labelKey: "demoRoles.candidate" },
] as const;

export default async function LoginPage() {
	const t = await getTranslations("Login");
	const demoEnabled = process.env.ENABLE_DEMO_LOGIN === "true";
	return (
		<>
			<Header />
			<main className="mx-auto w-full max-w-sm flex-1 px-4 pt-16 pb-24 sm:pt-24">
				<h1 className="font-semibold text-2xl tracking-tight sm:text-3xl">
					{t("title")}
				</h1>
				<p className="mt-3 text-muted-foreground text-sm leading-relaxed">
					{t("subtitle")}
				</p>
				<form action={loginAction} className="mt-8 space-y-3">
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
				<p className="mt-6 text-center text-muted-foreground text-xs leading-relaxed">
					{t("note")}
				</p>

				{demoEnabled && (
					<div className="mt-10 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
						<p className="font-medium text-amber-700 text-xs uppercase tracking-wide dark:text-amber-300">
							{t("demoTitle")}
						</p>
						<p className="mt-1 text-muted-foreground text-xs leading-relaxed">
							{t("demoSubtitle")}
						</p>
						<div className="mt-4 grid grid-cols-2 gap-2">
							{DEMO_ROLES.map((r) => (
								<a
									key={r.key}
									href={`/api/demo-login?role=${r.key}`}
									className="rounded-md border border-border bg-background px-3 py-2 text-center text-sm transition hover:bg-muted"
								>
									{t(r.labelKey)}
								</a>
							))}
						</div>
					</div>
				)}
			</main>
			<Footer />
		</>
	);
}
