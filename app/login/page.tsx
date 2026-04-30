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

export default async function LoginPage() {
	const t = await getTranslations("Login");
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
			</main>
			<Footer />
		</>
	);
}
