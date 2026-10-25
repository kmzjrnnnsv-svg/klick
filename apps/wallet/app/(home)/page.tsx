import { Landing } from "@wallet/components/landing/landing";
import { AppFrame } from "@wallet/components/shell/app-frame";
import { WalletHome } from "@wallet/components/wallet/home-overview";
import { sessionOrNull } from "@wallet/lib/auth/gates";
import type { Metadata } from "next";

// „/“: abgemeldet die öffentliche Startseite, angemeldet die Übersicht im
// Rahmen der App (Org, Entsperren und Einführung wie bisher über die Gates)
export async function generateMetadata(): Promise<Metadata> {
	return (await sessionOrNull())
		? { title: "Wallet" }
		: {
				title: {
					absolute: "both.money · Geld weitergeben, beide Seiten geprüft",
				},
			};
}

export default async function HomePage() {
	if (!(await sessionOrNull())) return <Landing />;
	return (
		<AppFrame>
			<WalletHome />
		</AppFrame>
	);
}
