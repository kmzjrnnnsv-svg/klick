import { ShieldCheck, Wallet } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";

export type ShellArea = "compliance" | "wallet";

// Umschalter im Kopf: Compliance ↔ Wallet. Nur sichtbar mit wallet:read;
// der Wallet-Bereich verlangt danach eigens den Passkey (Entsperren).
export async function AreaSwitcher({ area }: { area: ShellArea }) {
	const t = await getTranslations("Nav");
	const items = [
		{
			key: "compliance" as const,
			href: "/heute",
			label: t("areaCompliance"),
			Icon: ShieldCheck,
		},
		{
			key: "wallet" as const,
			href: "/wallet",
			label: t("areaWallet"),
			Icon: Wallet,
		},
	];
	return (
		<nav
			aria-label={t("areaLabel")}
			className="flex items-center gap-0.5 rounded-md border border-border/60 bg-muted/40 p-0.5"
		>
			{items.map(({ key, href, label, Icon }) => {
				const active = key === area;
				return (
					<Link
						key={key}
						href={href}
						title={label}
						aria-current={active ? "page" : undefined}
						className={cn(
							"flex h-8 items-center gap-1.5 rounded-sm px-2 text-[0.72rem] transition-[background-color,color] focus-visible:outline-2 focus-visible:outline-primary sm:px-3",
							active
								? "bg-background font-medium text-foreground shadow-xs"
								: "text-muted-foreground hover:bg-background/60 hover:text-foreground",
						)}
					>
						<Icon className="size-3.5" aria-hidden />
						{/* Telefon: nur Symbol, Name für Screenreader */}
						<span className="sr-only sm:not-sr-only">{label}</span>
					</Link>
				);
			})}
		</nav>
	);
}
