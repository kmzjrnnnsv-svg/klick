import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { NETWORKS } from "@/lib/wallet/core/networks";

// Startseite von both.money. Anmelden und die Wallet selbst folgen (W2/W3);
// die Netzliste beweist, dass geteilte Bausteine von der Repo-Wurzel laden.
export default async function HomePage() {
	const t = await getTranslations("Home");
	const testnets = Object.values(NETWORKS).filter((n) => !n.live);
	return (
		<main
			id="inhalt"
			className="mx-auto flex w-full max-w-xl grow flex-col justify-center gap-6 px-4 py-16"
		>
			<h1 className="font-serif-display text-4xl text-primary">both.money</h1>
			<p className="text-lg leading-relaxed">{t("lead")}</p>
			<p className="text-muted-foreground text-sm">
				{t("invite")} · {testnets.map((n) => n.label).join(", ")}
			</p>
			<div>
				<Button disabled>{t("login")}</Button>
			</div>
		</main>
	);
}
