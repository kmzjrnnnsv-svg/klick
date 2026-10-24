import type { WalletNavIcon } from "@wallet/lib/nav";
import {
	ArrowDownToLine,
	BookUser,
	History,
	House,
	List,
	ScrollText,
	Send,
	Settings,
	ShieldCheck,
	TrendingUp,
	Upload,
	Users,
	Vault,
} from "lucide-react";

const ICONS = {
	home: House,
	"arrow-down": ArrowDownToLine,
	"trending-up": TrendingUp,
	history: History,
	vault: Vault,
	send: Send,
	list: List,
	"book-user": BookUser,
	shield: ShieldCheck,
	users: Users,
	scroll: ScrollText,
	upload: Upload,
	settings: Settings,
} as const;

export function NavIcon({
	name,
	className,
}: {
	name: WalletNavIcon;
	className?: string;
}) {
	const Icon = ICONS[name];
	return <Icon className={className} strokeWidth={1.75} aria-hidden="true" />;
}
