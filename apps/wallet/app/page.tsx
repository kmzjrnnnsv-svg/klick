import { LockButton } from "@wallet/components/auth/lock-button";
import { SignOutButton } from "@wallet/components/auth/sign-out-button";
import { requireUnlockedPage } from "@wallet/lib/auth/gates";
import { ROLE_LABEL } from "@wallet/lib/auth/permissions";
import { getTranslations } from "next-intl/server";

// Startseite von both.money: angemeldet und entsperrt. Rahmen mit Navigation
// und die Wallet selbst folgen (W2c/W3).
export default async function HomePage() {
	const t = await getTranslations("Home");
	const ctx = await requireUnlockedPage("/");
	return (
		<main
			id="inhalt"
			className="mx-auto flex w-full max-w-xl grow flex-col justify-center gap-6 px-4 py-16"
		>
			<h1 className="font-serif-display text-4xl text-primary">both.money</h1>
			<p className="text-lg leading-relaxed">{t("lead")}</p>
			<p className="text-muted-foreground text-sm">
				{ctx.name} · {ctx.orgName} · {ROLE_LABEL[ctx.role]}
			</p>
			<div className="flex gap-3">
				<LockButton />
				<SignOutButton />
			</div>
		</main>
	);
}
